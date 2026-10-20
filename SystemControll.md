# Hooshcode Computer Controller: agentic GUI routing fix

## Problem

Hooshcode exposes `computercontroller__computer_control`, but the extension's
system instructions also tell the model to use the Developer shell for
"accessing web sites". For GUI tasks the model can therefore choose a command
such as:

```powershell
Start-Process "https://example.com"
```

That command opens a window but returns no visual state. The model then says it
cannot inspect the page even though Computer Controller can capture screenshots
and interact with the desktop. The same routing failure affects browser work,
video editing, Photoshop, Premiere, and other desktop applications.

This is a Hooshcode orchestration problem, not an API gateway concern.

## Required behavior

Classify a request as a GUI task when completing it requires observing or
interacting with a rendered desktop application. Examples include:

- browsing a logged-in site;
- reading a dashboard that is visible in the browser;
- editing a video in Premiere, DaVinci Resolve, or another editor;
- interacting with Photoshop, Office, system dialogs, or native applications;
- clicking, typing, dragging, scrolling, choosing menus, or verifying visible
  output.

For a GUI task the agent must use this feedback loop:

1. Launch or focus the target application.
2. Call `computercontroller__computer_control` with `command: "see"`.
3. Inspect the returned screenshot.
4. Perform one or more `click`, `type`, `press`, `hotkey`, `drag`, or application
   focus actions.
5. Call `see` again to verify the resulting state.
6. Continue until the requested visible result is confirmed.

Opening an application with the shell is only a launch step. It never counts as
inspection or task completion.

## Source change

Update:

`crates/goose-mcp/src/computercontroller/mod.rs`

The current general instruction contains this ambiguous sentence:

```text
Use the shell (developer extension) for scripting, working with data files
(csv, json, text), and accessing web sites or APIs when needed.
```

Replace it with routing guidance equivalent to:

```text
Choose tools by the state that must be observed:

- Use Computer Controller for every task that requires seeing or interacting
  with a rendered GUI: browsers, logged-in web pages, video editors, image
  editors, Office applications, native applications, and system dialogs.
- Use the Developer shell for source code, scripts, files, processes, CLI tools,
  and non-interactive HTTP/API requests whose result is returned as text.
- A shell command that merely launches a GUI application does not provide its
  visual state. After launch, use computer_control `see`, interact, and `see`
  again to verify the result.
- Never tell the user to provide a screenshot when Computer Controller is
  enabled and can call `see` itself.
- For long GUI tasks, repeat the observe -> act -> verify loop until the visible
  outcome is confirmed. Do not stop after launching the application.
```

Keep the OS-specific command documentation that already exists below this
general policy.

## Tool availability guard

Before starting a run, Hooshcode should determine whether
`computercontroller__computer_control` is present in the active tool registry.

- If present, GUI requests must route to it.
- If absent, the assistant may explain that Computer Controller is disabled or
  unavailable and provide the exact enablement action.
- The assistant must not claim lack of visual access merely because its first
  shell command returned no output.

The built-in extension should remain enabled in:

`ui/desktop/src/built-in-extensions.json`

and the active session must include the extension. A configuration default is
not enough if a session-level extension filter removes it.

## Anthropic transport behavior

For the native Anthropic provider, Hooshcode currently converts
`computercontroller__computer_control` to:

```json
{
  "type": "computer_toolset_20260801"
}
```

in:

`crates/goose-provider-types/src/formats/anthropic.rs`

Keep that conversion. Returned computer actions must continue to map back to
`computercontroller__computer_control`, including the action metadata needed to
replay tool history. Do not replace the native toolset with shell commands.

For providers that do not support the Anthropic native computer toolset, keep
the normal MCP function tool and expose its `command` schema directly instead
of silently dropping it.

## Windows requirements

The existing Windows implementation in
`crates/goose-mcp/src/computercontroller/windows.rs` must return the screenshot
as an image content block for `see`/`screenshot`. A text response containing
only a file path is insufficient because the model cannot inspect it.

After actions that accept `capture_screenshot: true`, return both:

- a concise textual action result; and
- the captured `image/png` content block.

Failures to capture the screen should be returned as tool errors rather than a
successful result with no image.

## Suggested routing tests

Add tests around the assembled system instructions and active tools. At minimum:

1. A browser request such as "open the usage page and report the value" includes
   Computer Controller and instructions requiring `see` after launch.
2. A video request such as "open Premiere and trim the first clip" routes to the
   GUI observe/act/verify policy, not shell-only execution.
3. A CLI request such as "curl this public JSON endpoint" still routes to the
   Developer shell.
4. When Computer Controller is disabled, the model receives an explicit
   unavailable state instead of misleading instructions.
5. A Windows `see` call returns an `image/png` content block.
6. An action with `capture_screenshot: true` returns a verification image.

## Manual acceptance tests

### Browser

Prompt:

```text
Open the browser, go to the Usage page of the currently logged-in service, and
report the displayed usage.
```

Expected tool sequence:

```text
launch/focus browser -> see -> click/type as needed -> see -> final answer
```

The run fails acceptance if it ends after `Start-Process`, asks the user for a
screenshot, or claims it cannot see the page while Computer Controller is
active.

### Video editor

Prompt:

```text
Open the current video project, remove the silent section at the beginning,
export an H.264 preview, and verify that the export completed.
```

Expected behavior:

- focus the editor;
- inspect the timeline with `see`;
- use GUI actions and keyboard shortcuts;
- inspect dialogs and progress state;
- verify the exported result visibly before reporting completion.

The agent must not treat merely starting the editor or export command as task
completion.

