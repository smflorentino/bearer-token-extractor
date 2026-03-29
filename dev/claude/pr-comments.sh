#!/usr/bin/env bash
# Manage PR review comments: list, reply, and resolve.
# Usage:
#   dev/claude/pr-comments.sh list [pr-number]
#   dev/claude/pr-comments.sh reply <pr-number> <comment-id> <body>
#   dev/claude/pr-comments.sh resolve <pr-number> [thread-id | --all]
#   dev/claude/pr-comments.sh reply-resolve <pr-number> <body>
#
# Commands:
#   list           Show unresolved review comments (id, path, body excerpt)
#   reply          Reply to a specific comment by its REST id
#   resolve        Resolve a single thread by GraphQL id, or --all unresolved
#   reply-resolve  Reply to ALL unresolved comments with <body>, then resolve them
#
# The repo is auto-detected from the current git remote.

set -euo pipefail

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \?//'
  exit "${1:-1}"
}

# --- Detect repo from git remote ---
# Prefer upstream (fork workflow) over origin
detect_repo() {
  local url
  url=$(git remote get-url upstream 2>/dev/null) \
    || url=$(git remote get-url origin 2>/dev/null) \
    || { echo "ERROR: Not a git repo or no remote found." >&2; exit 1; }
  # Handle both HTTPS and SSH URLs
  echo "$url" | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##'
}

REPO=$(detect_repo)

# --- Helpers ---
require_gh() {
  command -v gh &>/dev/null || { echo "ERROR: gh CLI not found. Install from https://cli.github.com" >&2; exit 1; }
}

require_arg() {
  if [ -z "${1:-}" ]; then
    echo "ERROR: Missing required argument: $2" >&2
    usage
  fi
}

# Auto-detect PR number from current branch if not provided
detect_pr() {
  local pr
  pr=$(gh pr view --json number --jq '.number' 2>/dev/null) || { echo "ERROR: Could not detect PR for current branch. Pass a PR number explicitly." >&2; exit 1; }
  echo "$pr"
}

# --- Commands ---

cmd_list() {
  local pr="${1:-$(detect_pr)}"

  echo "Unresolved review comments on ${REPO}#${pr}:"
  echo "---"

  local threads
  threads=$(gh api graphql -f query="
  {
    repository(owner: \"${REPO%%/*}\", name: \"${REPO##*/}\") {
      pullRequest(number: ${pr}) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes {
                databaseId
                path
                body
              }
            }
          }
        }
      }
    }
  }" --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)')

  if [ -z "$threads" ]; then
    echo "(none)"
    return 0
  fi

  echo "$threads" | jq -r '
    .comments.nodes[0] as $c |
    "ID: \(.id)\nComment ID: \($c.databaseId)\nFile: \($c.path)\nBody: \($c.body | split("\n")[0] | if length > 120 then .[:120] + "..." else . end)\n---"
  '
}

cmd_reply() {
  local pr="$1" comment_id="$2" body="$3"
  require_arg "$pr" "pr-number"
  require_arg "$comment_id" "comment-id"
  require_arg "$body" "body"

  local result
  result=$(gh api "repos/${REPO}/pulls/${pr}/comments" \
    -f body="$body" \
    -F in_reply_to="$comment_id" \
    --jq '.id' 2>&1) || { echo "ERROR: Failed to reply: $result" >&2; exit 1; }

  echo "Replied to comment ${comment_id} (new reply id: ${result})"
}

cmd_resolve() {
  local pr="$1" target="${2:---all}"

  if [ "$target" = "--all" ]; then
    local thread_ids
    thread_ids=$(gh api graphql -f query="
    {
      repository(owner: \"${REPO%%/*}\", name: \"${REPO##*/}\") {
        pullRequest(number: ${pr}) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
            }
          }
        }
      }
    }" --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id')

    if [ -z "$thread_ids" ]; then
      echo "No unresolved threads."
      return 0
    fi

    local count=0
    while IFS= read -r tid; do
      gh api graphql -f query="mutation { resolveReviewThread(input: {threadId: \"${tid}\"}) { thread { isResolved } } }" --jq '.data.resolveReviewThread.thread.isResolved' >/dev/null
      count=$((count + 1))
    done <<< "$thread_ids"
    echo "Resolved ${count} thread(s)."
  else
    gh api graphql -f query="mutation { resolveReviewThread(input: {threadId: \"${target}\"}) { thread { isResolved } } }" --jq '.data.resolveReviewThread.thread.isResolved' >/dev/null \
      || { echo "ERROR: Failed to resolve thread ${target}" >&2; exit 1; }
    echo "Resolved thread ${target}."
  fi
}

cmd_reply_resolve() {
  local pr="$1" body="$2"
  require_arg "$pr" "pr-number"
  require_arg "$body" "body"

  # Get unresolved threads with their first comment's REST id
  local threads
  threads=$(gh api graphql -f query="
  {
    repository(owner: \"${REPO%%/*}\", name: \"${REPO##*/}\") {
      pullRequest(number: ${pr}) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes {
                databaseId
              }
            }
          }
        }
      }
    }
  }" --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | {threadId: .id, commentId: .comments.nodes[0].databaseId}')

  if [ -z "$threads" ]; then
    echo "No unresolved threads."
    return 0
  fi

  local count=0
  while IFS= read -r line; do
    local thread_id comment_id
    thread_id=$(echo "$line" | jq -r '.threadId')
    comment_id=$(echo "$line" | jq -r '.commentId')

    # Reply
    gh api "repos/${REPO}/pulls/${pr}/comments" \
      -f body="$body" \
      -F in_reply_to="$comment_id" \
      --jq '.id' >/dev/null 2>&1 || { echo "WARNING: Failed to reply to comment ${comment_id}, skipping." >&2; continue; }

    # Resolve
    gh api graphql -f query="mutation { resolveReviewThread(input: {threadId: \"${thread_id}\"}) { thread { isResolved } } }" \
      --jq '.data.resolveReviewThread.thread.isResolved' >/dev/null 2>&1 || { echo "WARNING: Failed to resolve thread ${thread_id}." >&2; continue; }

    count=$((count + 1))
  done <<< "$threads"

  echo "Replied to and resolved ${count} thread(s)."
}

# --- Main ---
require_gh

cmd="${1:-}"
shift || true

case "$cmd" in
  -h|--help)      usage 0 ;;
  list)           cmd_list "${1:-}" ;;
  reply)          cmd_reply "${1:-}" "${2:-}" "${3:-}" ;;
  resolve)        cmd_resolve "${1:-$(detect_pr)}" "${2:---all}" ;;
  reply-resolve)  cmd_reply_resolve "${1:-}" "${2:-}" ;;
  *)              usage ;;
esac
