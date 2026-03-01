#!/usr/bin/env bash
# jadlis-research: env file management utilities
# This script is sourced, not executed directly.

# Overridable for test isolation (tests set these to temp dirs)
JADLIS_HOME="${JADLIS_HOME:-${HOME}/.jadlis-research}"
JADLIS_ENV_FILE="${JADLIS_ENV_FILE:-${JADLIS_HOME}/env}"
MANAGED_BLOCK_START="# >>> jadlis-research managed env >>>"
MANAGED_BLOCK_END="# <<< jadlis-research managed env <<<"

# Validate variable name: must be a valid shell identifier
_jadlis_validate_var_name() {
  local name="$1"
  if [[ ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Error: invalid variable name '$name'" >&2
    return 1
  fi
}

jadlis_ensure_home_dir() {
  if [[ ! -d "$JADLIS_HOME" ]]; then
    mkdir -p "$JADLIS_HOME" || { echo "Cannot create $JADLIS_HOME" >&2; return 1; }
  fi
  chmod 700 "$JADLIS_HOME" || { echo "Cannot chmod 700 $JADLIS_HOME" >&2; return 1; }
}

jadlis_escape_for_single_quote() {
  local value="$1"
  # Replace each ' with '\'' (end quote, escaped quote, start quote)
  printf '%s' "$value" | sed "s/'/'\\\\''/g"
}

write_env_var() {
  local var_name="$1"
  local value="${2-}"

  _jadlis_validate_var_name "$var_name" || return 1

  if [[ -z "$value" ]]; then
    echo "Error: value for $var_name cannot be empty" >&2
    return 1
  fi

  jadlis_ensure_home_dir || return 1

  local escaped
  escaped=$(jadlis_escape_for_single_quote "$value")
  local export_line="export ${var_name}='${escaped}'"

  if [[ ! -f "$JADLIS_ENV_FILE" ]]; then
    # Create new file with managed block
    printf '%s\n%s\n%s\n' "$MANAGED_BLOCK_START" "$export_line" "$MANAGED_BLOCK_END" > "$JADLIS_ENV_FILE"
  elif grep -qF "$MANAGED_BLOCK_START" "$JADLIS_ENV_FILE"; then
    # Managed block exists — replace or append within it
    local tmp
    tmp=$(mktemp)
    local in_block=false
    local var_written=false

    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" == "$MANAGED_BLOCK_START" ]]; then
        in_block=true
        printf '%s\n' "$line" >> "$tmp"
        continue
      fi
      if [[ "$line" == "$MANAGED_BLOCK_END" ]]; then
        # If var wasn't replaced, append before end marker
        if ! $var_written; then
          printf '%s\n' "$export_line" >> "$tmp"
        fi
        in_block=false
        printf '%s\n' "$line" >> "$tmp"
        continue
      fi
      if $in_block && [[ "$line" == "export ${var_name}="* ]]; then
        # Replace existing line
        printf '%s\n' "$export_line" >> "$tmp"
        var_written=true
        continue
      fi
      printf '%s\n' "$line" >> "$tmp"
    done < "$JADLIS_ENV_FILE"

    if ! mv "$tmp" "$JADLIS_ENV_FILE"; then
      rm -f "$tmp"
      echo "Error: failed to update $JADLIS_ENV_FILE" >&2
      return 1
    fi
  else
    # No managed block — append it
    printf '\n%s\n%s\n%s\n' "$MANAGED_BLOCK_START" "$export_line" "$MANAGED_BLOCK_END" >> "$JADLIS_ENV_FILE"
  fi

  chmod 600 "$JADLIS_ENV_FILE" || { echo "Cannot chmod 600 $JADLIS_ENV_FILE" >&2; return 1; }
}

read_env_var() {
  local var_name="$1"

  _jadlis_validate_var_name "$var_name" || return 1
  [[ -f "$JADLIS_ENV_FILE" ]] || return 1

  local in_block=false
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$MANAGED_BLOCK_START" ]]; then
      in_block=true
      continue
    fi
    if [[ "$line" == "$MANAGED_BLOCK_END" ]]; then
      in_block=false
      continue
    fi
    if $in_block && [[ "$line" == "export ${var_name}="* ]]; then
      # Eval the export in a subshell and print the value
      local val
      val=$(bash -c "$line; printf '%s' \"\$$var_name\"")
      printf '%s\n' "$val"
      return 0
    fi
  done < "$JADLIS_ENV_FILE"

  return 1
}

ensure_zshrc_source_line() {
  local zshrc="${1:-${HOME}/.zshrc}"
  local source_line="source ~/.jadlis-research/env"

  if [[ ! -f "$zshrc" ]]; then
    touch "$zshrc" || { echo "Cannot create $zshrc" >&2; return 1; }
  fi

  # Check if already present
  if grep -qF "$source_line" "$zshrc"; then
    return 0
  fi

  # Append with comment
  {
    echo ""
    echo "# jadlis-research: load API keys"
    echo "$source_line"
  } >> "$zshrc" || { echo "Cannot write to $zshrc" >&2; return 1; }
}

jadlis_source_env_to_claude() {
  [[ -f "$JADLIS_ENV_FILE" ]] || return 0

  if [[ -z "${CLAUDE_ENV_FILE:-}" ]]; then
    echo "Warning: CLAUDE_ENV_FILE is not set, skipping env injection" >&2
    return 0
  fi

  local in_block=false
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$MANAGED_BLOCK_START" ]]; then
      in_block=true
      continue
    fi
    if [[ "$line" == "$MANAGED_BLOCK_END" ]]; then
      in_block=false
      continue
    fi
    if $in_block && [[ "$line" == export\ * ]]; then
      # Extract var name
      local assignment="${line#export }"
      local vname="${assignment%%=*}"
      # Eval the export in a subshell to get the raw value
      local vval
      vval=$(bash -c "$line; printf '%s' \"\$$vname\"")
      printf '%s=%s\n' "$vname" "$vval" >> "$CLAUDE_ENV_FILE"
    fi
  done < "$JADLIS_ENV_FILE"
}
