use crate::computercontroller::{ComputerControlParams, ComputerControllerServer};
use base64::Engine;
use rmcp::model::{CallToolResult, ContentBlock, ErrorCode, ErrorData};
use std::fs;
use std::path::PathBuf;

/// Execute a PowerShell script safely via UTF-16LE EncodedCommand
pub async fn run_powershell_script(script: &str) -> Result<String, ErrorData> {
    let utf16: Vec<u16> = script.encode_utf16().collect();
    let mut bytes = Vec::with_capacity(utf16.len() * 2);
    for code_unit in utf16 {
        bytes.extend_from_slice(&code_unit.to_le_bytes());
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let output = tokio::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &encoded,
        ])
        .output()
        .await
        .map_err(|e| {
            ErrorData::new(
                ErrorCode::INTERNAL_ERROR,
                format!("Failed to execute powershell: {}", e),
                None,
            )
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Filter out CLIXML progress lines if any
    let cleaned_stdout: String = stdout
        .lines()
        .filter(|line| !line.starts_with("#< CLIXML") && !line.starts_with("<Objs") && !line.starts_with("<Obj "))
        .collect::<Vec<_>>()
        .join("\n");

    if !output.status.success() && cleaned_stdout.trim().is_empty() {
        return Err(ErrorData::new(
            ErrorCode::INTERNAL_ERROR,
            format!("PowerShell command failed: {}", stderr.trim()),
            None,
        ));
    }

    Ok(cleaned_stdout.trim().to_string())
}

impl ComputerControllerServer {
    /// Helper to generate screenshot file path
    pub(crate) fn get_windows_cache_path(&self, prefix: &str, extension: &str) -> PathBuf {
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        self.cache_dir
            .join(format!("{}_{}.{}", prefix, timestamp, extension))
    }

    /// Windows implementation of computer_control
    pub async fn windows_impl(
        &self,
        params: rmcp::handler::server::wrapper::Parameters<ComputerControlParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let params = params.0;
        let command_str = params.command.trim();

        if command_str.is_empty() {
            return Err(ErrorData::new(
                ErrorCode::INVALID_PARAMS,
                "Command cannot be empty".to_string(),
                None,
            ));
        }

        let args = shell_words::split(command_str).map_err(|e| {
            ErrorData::new(
                ErrorCode::INVALID_PARAMS,
                format!("Failed to parse command: {}", e),
                None,
            )
        })?;

        let action = args[0].to_lowercase();
        let mut contents: Vec<ContentBlock> = Vec::new();
        #[allow(unused_assignments)]
        let mut result_text = String::new();
        let mut capture_after = params.capture_screenshot;

        match action.as_str() {
            "see" | "screenshot" | "image" => {
                // Check if user requested an app focus first e.g. "see --app Photoshop"
                let target_app = parse_flag_value(&args, "--app");
                if let Some(app) = target_app {
                    let switch_script = format!(
                        r#"
Add-Type -AssemblyName Microsoft.VisualBasic
$proc = Get-Process | Where-Object {{ $_.MainWindowTitle -match '{app}' -or $_.ProcessName -match '{app}' }} | Select-Object -First 1
if ($proc) {{
    [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id)
    Start-Sleep -Milliseconds 300
}}
"#
                    );
                    let _ = run_powershell_script(&switch_script).await;
                }

                let shot_path = self.get_windows_cache_path("screenshot", "png");
                let shot_str = shot_path.to_string_lossy().replace('\\', "/");

                let cap_script = format!(
                    r#"
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('{shot_str}', [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()
Write-Output "Screen captured ($($bounds.Width)x$($bounds.Height))"
"#
                );

                let output = run_powershell_script(&cap_script).await?;
                result_text = format!("{}\nFile: {}", output, shot_path.display());

                if shot_path.exists() {
                    if let Ok(bytes) = fs::read(&shot_path) {
                        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                        contents.push(ContentBlock::image(b64, "image/png"));
                    }
                }
                capture_after = false;
            }

            "click" => {
                let coords = parse_coords(&args);
                let is_double = args.iter().any(|a| a == "--double");
                let is_right = args.iter().any(|a| a == "--right");
                let is_middle = args.iter().any(|a| a == "--middle");

                let (x_part, y_part) = match coords {
                    Some((x, y)) => (format!("[WinMouse]::SetCursorPos({}, {}); Start-Sleep -Milliseconds 50;", x, y), format!(" at ({}, {})", x, y)),
                    None => (String::new(), " at current position".to_string()),
                };

                let click_type = if is_double {
                    "[WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0); Start-Sleep -Milliseconds 100; [WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);"
                } else if is_right {
                    "[WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0); [WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);"
                } else if is_middle {
                    "[WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0); [WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);"
                } else {
                    "[WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);"
                };

                let script = format!(
                    r#"
$typeDef = @"
using System;
using System.Runtime.InteropServices;
public class WinMouse {{
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, int extra);
    public const uint MOUSEEVENTF_LEFTDOWN = 0x02;
    public const uint MOUSEEVENTF_LEFTUP = 0x04;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x08;
    public const uint MOUSEEVENTF_RIGHTUP = 0x10;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x20;
    public const uint MOUSEEVENTF_MIDDLEUP = 0x40;
}}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMouse').Type) {{
    Add-Type -TypeDefinition $typeDef
}}
{x_part}
{click_type}
Write-Output "Clicked{y_part}"
"#
                );

                result_text = run_powershell_script(&script).await?;
            }

            "move" => {
                let coords = parse_coords(&args).ok_or_else(|| {
                    ErrorData::new(
                        ErrorCode::INVALID_PARAMS,
                        "move command requires coordinates, e.g., 'move --coords 500,300' or 'move 500 300'".to_string(),
                        None,
                    )
                })?;

                let script = format!(
                    r#"
$typeDef = @"
using System.Runtime.InteropServices;
public class WinMouseMove {{
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMouseMove').Type) {{
    Add-Type -TypeDefinition $typeDef
}}
[WinMouseMove]::SetCursorPos({}, {})
Write-Output "Moved cursor to ({}, {})"
"#,
                    coords.0, coords.1, coords.0, coords.1
                );

                result_text = run_powershell_script(&script).await?;
            }

            "drag" => {
                let (from_x, from_y, to_x, to_y) = parse_drag_coords(&args).ok_or_else(|| {
                    ErrorData::new(
                        ErrorCode::INVALID_PARAMS,
                        "drag requires from and to coordinates, e.g. 'drag --from 100,200 --to 400,500' or 'drag 100 200 400 500'".to_string(),
                        None,
                    )
                })?;

                let script = format!(
                    r#"
$typeDef = @"
using System;
using System.Runtime.InteropServices;
public class WinMouseDrag {{
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, int extra);
    public const uint MOUSEEVENTF_LEFTDOWN = 0x02;
    public const uint MOUSEEVENTF_LEFTUP = 0x04;
}}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMouseDrag').Type) {{
    Add-Type -TypeDefinition $typeDef
}}
[WinMouseDrag]::SetCursorPos({from_x}, {from_y})
Start-Sleep -Milliseconds 60
[WinMouseDrag]::mouse_event([WinMouseDrag]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
Start-Sleep -Milliseconds 60

$steps = 15
for ($i = 1; $i -le $steps; $i++) {{
    $curX = [int]({from_x} + ({to_x} - {from_x}) * ($i / $steps))
    $curY = [int]({from_y} + ({to_y} - {from_y}) * ($i / $steps))
    [WinMouseDrag]::SetCursorPos($curX, $curY)
    Start-Sleep -Milliseconds 15
}}

Start-Sleep -Milliseconds 60
[WinMouseDrag]::mouse_event([WinMouseDrag]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
Write-Output "Dragged from ({from_x}, {from_y}) to ({to_x}, {to_y})"
"#
                );

                result_text = run_powershell_script(&script).await?;
            }

            "type" => {
                let text = parse_flag_value(&args, "--text")
                    .or_else(|| {
                        if args.len() > 1 && !args[1].starts_with("--") {
                            Some(args[1].clone())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_default();

                let with_return = args.iter().any(|a| a == "--return");
                let with_clear = args.iter().any(|a| a == "--clear");

                let return_send = if with_return {
                    "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"
                } else {
                    ""
                };

                let clear_send = if with_clear {
                    "[System.Windows.Forms.SendKeys]::SendWait('^a{DELETE}'); Start-Sleep -Milliseconds 50;"
                } else {
                    ""
                };

                // Use clipboard paste for unicode and symbol fidelity
                let escaped_text = text.replace('\'', "''");
                let script = format!(
                    r#"
Add-Type -AssemblyName System.Windows.Forms
{clear_send}
Set-Clipboard -Value '{escaped_text}'
Start-Sleep -Milliseconds 50
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 50
{return_send}
Write-Output "Typed text: {escaped_text}"
"#
                );

                result_text = run_powershell_script(&script).await?;
            }

            "press" => {
                let key_name = if args.len() > 1 && !args[1].starts_with("--") {
                    args[1].to_lowercase()
                } else {
                    "enter".to_string()
                };

                let count: usize = parse_flag_value(&args, "--count")
                    .and_then(|c| c.parse().ok())
                    .unwrap_or(1);

                let send_code = match key_name.as_str() {
                    "enter" | "return" => "{ENTER}",
                    "tab" => "{TAB}",
                    "space" => " ",
                    "escape" | "esc" => "{ESC}",
                    "backspace" | "bs" => "{BACKSPACE}",
                    "delete" | "del" => "{DELETE}",
                    "up" => "{UP}",
                    "down" => "{DOWN}",
                    "left" => "{LEFT}",
                    "right" => "{RIGHT}",
                    "home" => "{HOME}",
                    "end" => "{END}",
                    "pageup" | "pgup" => "{PGUP}",
                    "pagedown" | "pgdn" => "{PGDN}",
                    "f1" => "{F1}",
                    "f2" => "{F2}",
                    "f3" => "{F3}",
                    "f4" => "{F4}",
                    "f5" => "{F5}",
                    "f6" => "{F6}",
                    "f7" => "{F7}",
                    "f8" => "{F8}",
                    "f9" => "{F9}",
                    "f10" => "{F10}",
                    "f11" => "{F11}",
                    "f12" => "{F12}",
                    other => other,
                };

                let script = format!(
                    r#"
Add-Type -AssemblyName System.Windows.Forms
for ($i = 0; $i -lt {count}; $i++) {{
    [System.Windows.Forms.SendKeys]::SendWait('{send_code}')
    Start-Sleep -Milliseconds 50
}}
Write-Output "Pressed {key_name} {count} time(s)"
"#
                );

                result_text = run_powershell_script(&script).await?;
            }

            "hotkey" => {
                let keys_str = parse_flag_value(&args, "--keys")
                    .or_else(|| if args.len() > 1 && !args[1].starts_with("--") { Some(args[1].clone()) } else { None })
                    .unwrap_or_default();

                let send_keys_format = format_hotkey_for_sendkeys(&keys_str);

                let script = format!(
                    r#"
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('{send_keys_format}')
Write-Output "Sent hotkey: {keys_str} ({send_keys_format})"
"#
                );

                result_text = run_powershell_script(&script).await?;
            }

            "app" | "window" => {
                let sub = if args.len() > 1 { args[1].to_lowercase() } else { "list".to_string() };
                if sub == "switch" || sub == "focus" || sub == "launch" {
                    let target_name = if args.len() > 2 {
                        args[2..].join(" ")
                    } else {
                        "".to_string()
                    };

                    let script = format!(
                        r#"
Add-Type -AssemblyName Microsoft.VisualBasic
$query = '{target_name}'
$proc = Get-Process | Where-Object {{ $_.MainWindowTitle -match $query -or $_.ProcessName -match $query }} | Select-Object -First 1
if ($proc) {{
    [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id)
    Write-Output "Activated window: '$($proc.MainWindowTitle)' (Process: $($proc.ProcessName), PID: $($proc.Id))"
}} else {{
    Write-Output "No active window found matching '$query'"
}}
"#
                    );
                    result_text = run_powershell_script(&script).await?;
                } else {
                    let script = r#"
Get-Process | Where-Object { $_.MainWindowTitle.Length -gt 0 } | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize | Out-String -Width 120
"#;
                    result_text = run_powershell_script(script).await?;
                }
            }

            "list" => {
                let script = r#"
Get-Process | Where-Object { $_.MainWindowTitle.Length -gt 0 } | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize | Out-String -Width 120
"#;
                result_text = run_powershell_script(script).await?;
            }

            _ => {
                return Err(ErrorData::new(
                    ErrorCode::INVALID_PARAMS,
                    format!("Unknown action: '{}'. Supported actions: see, click, move, drag, type, press, hotkey, app switch, list windows", action),
                    None,
                ));
            }
        }

        // Handle capture_screenshot if requested after action
        if capture_after {
            let shot_path = self.get_windows_cache_path("action_capture", "png");
            let shot_str = shot_path.to_string_lossy().replace('\\', "/");
            let cap_script = format!(
                r#"
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('{shot_str}', [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()
"#
            );

            let _ = run_powershell_script(&cap_script).await;
            if shot_path.exists() {
                if let Ok(bytes) = fs::read(&shot_path) {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    contents.push(ContentBlock::image(b64, "image/png"));
                }
            }
        }

        contents.insert(
            0,
            ContentBlock::Text(
                rmcp::model::TextContent::new(&result_text).with_annotations(
                    rmcp::model::Annotations::default()
                        .with_audience(vec![rmcp::model::Role::Assistant]),
                ),
            ),
        );

        Ok(CallToolResult::success(contents))
    }
}

fn parse_flag_value(args: &[String], flag: &str) -> Option<String> {
    for i in 0..args.len() {
        if args[i] == flag && i + 1 < args.len() {
            return Some(args[i + 1].clone());
        }
        if args[i].starts_with(&format!("{}=", flag)) {
            return Some(args[i][flag.len() + 1..].to_string());
        }
    }
    None
}

fn parse_coords(args: &[String]) -> Option<(i32, i32)> {
    if let Some(val) = parse_flag_value(args, "--coords") {
        let parts: Vec<&str> = val.split(',').map(|s| s.trim()).collect();
        if parts.len() == 2 {
            if let (Ok(x), Ok(y)) = (parts[0].parse::<i32>(), parts[1].parse::<i32>()) {
                return Some((x, y));
            }
        }
    }

    if args.len() >= 3 {
        if let (Ok(x), Ok(y)) = (args[1].parse::<i32>(), args[2].parse::<i32>()) {
            return Some((x, y));
        }
    }

    None
}

fn parse_drag_coords(args: &[String]) -> Option<(i32, i32, i32, i32)> {
    let from = parse_flag_value(args, "--from");
    let to = parse_flag_value(args, "--to");

    if let (Some(f), Some(t)) = (from, to) {
        let f_parts: Vec<&str> = f.split(',').map(|s| s.trim()).collect();
        let t_parts: Vec<&str> = t.split(',').map(|s| s.trim()).collect();
        if f_parts.len() == 2 && t_parts.len() == 2 {
            if let (Ok(x1), Ok(y1), Ok(x2), Ok(y2)) = (
                f_parts[0].parse::<i32>(),
                f_parts[1].parse::<i32>(),
                t_parts[0].parse::<i32>(),
                t_parts[1].parse::<i32>(),
            ) {
                return Some((x1, y1, x2, y2));
            }
        }
    }

    if args.len() >= 5 {
        if let (Ok(x1), Ok(y1), Ok(x2), Ok(y2)) = (
            args[1].parse::<i32>(),
            args[2].parse::<i32>(),
            args[3].parse::<i32>(),
            args[4].parse::<i32>(),
        ) {
            return Some((x1, y1, x2, y2));
        }
    }

    None
}

fn format_hotkey_for_sendkeys(keys_str: &str) -> String {
    let keys = keys_str.replace('+', ",");
    let parts: Vec<String> = keys.split(',').map(|s| s.trim().to_lowercase()).collect();

    let mut prefix = String::new();
    let mut main_key = String::new();

    for part in parts {
        match part.as_str() {
            "ctrl" | "control" => prefix.push('^'),
            "shift" => prefix.push('+'),
            "alt" => prefix.push('%'),
            "win" | "cmd" | "command" => prefix.push('^'),
            "enter" | "return" => main_key = "{ENTER}".to_string(),
            "tab" => main_key = "{TAB}".to_string(),
            "space" => main_key = " ".to_string(),
            "escape" | "esc" => main_key = "{ESC}".to_string(),
            "delete" | "del" => main_key = "{DELETE}".to_string(),
            "backspace" => main_key = "{BACKSPACE}".to_string(),
            "up" => main_key = "{UP}".to_string(),
            "down" => main_key = "{DOWN}".to_string(),
            "left" => main_key = "{LEFT}".to_string(),
            "right" => main_key = "{RIGHT}".to_string(),
            "f1" => main_key = "{F1}".to_string(),
            "f2" => main_key = "{F2}".to_string(),
            "f3" => main_key = "{F3}".to_string(),
            "f4" => main_key = "{F4}".to_string(),
            "f5" => main_key = "{F5}".to_string(),
            "f6" => main_key = "{F6}".to_string(),
            "f7" => main_key = "{F7}".to_string(),
            "f8" => main_key = "{F8}".to_string(),
            "f9" => main_key = "{F9}".to_string(),
            "f10" => main_key = "{F10}".to_string(),
            "f11" => main_key = "{F11}".to_string(),
            "f12" => main_key = "{F12}".to_string(),
            k => main_key = k.to_string(),
        }
    }

    format!("{}{}", prefix, main_key)
}
