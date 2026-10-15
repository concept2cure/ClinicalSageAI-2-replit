# Shell conversation recovery

The rail shares the shell's chat instance, so leaving the full conversation
screen must not hide a history failure or consume a draft while the hook refuses
to send. `AnaRail` receives loading/error state and a Retry handler; its composer
keeps text and attachments until the history is available or the user starts a
new thread. V2App forwards that state and prevents side-panel sends during a
failed/pending history read.

The two regression cases fail before the UI fix (`red.txt`). Afterward, four
rail suites pass 37 tests, covering recovery, attachments, actions, and context
honesty (`green.txt`). The final shell destination and recovery tests are recorded
in `shell-green.txt`. Repository lint gates measure all changed source files.
