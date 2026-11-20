# Witness note moderation

The registry welcomes celebratory profanity. New notes containing recognized identity-based slurs, including some spelling substitutions and punctuation, receive a request to reword the note before the registry assigns a witness number. The check covers a limited English vocabulary. Context, other languages, and creative spellings still require human review. Notes are optional and limited to one line of 160 characters. Keep links out of entries.

## Remove a note by witness number

Use the witness number printed on the badge or at the end of the public witness URL. Use the number even when the display name is distinctive. Names may be shared and may contain accented Latin, Greek, or Cyrillic characters.

On the operator laptop, run this from the repository with the verified witness number in place of `000123`.

```sh
RIEMANN_ADMIN_SECRETS_FILE="$HOME/.local/state/riemann-witness/secrets.json" \
  node scripts/remove-note.mjs 000123
```

The command reads `ADMIN_TOKEN` from the private JSON file. If the token is already available in your environment, run `node scripts/remove-note.mjs 000123` directly. The command uses the production Worker origin by default. For local testing, set `WORKER_ORIGIN` to your loopback preview and supply its admin credential. Keep credentials in private files or environment variables.

The Worker replaces the message with `[note removed]`. The witness keeps their number, name, timestamp, badge image, visibility, and management access. The entry still contributes to the total. Running the same operation again is safe. The command reports the number on success and returns a nonzero exit code on failure. An unavailable number and a rejected credential produce the same response.

For a public witness, reopen their page and search by number to confirm the replacement. A private witness stays private. The registry serves the replacement in its current pages and API. Screenshots, third-party copies, and cached previews may still contain the original text.
