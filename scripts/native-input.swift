// macOS-only manual benchmark driver. Targets only a running PoC window.
// Usage: swift scripts/native-input.swift gpui|tauri click X Y
//        swift scripts/native-input.swift gpui|tauri type 'some text'
//        swift scripts/native-input.swift gpui|tauri key save|undo|start|end|down|up|left|right|enter|backspace|selectall
//        swift scripts/native-input.swift gpui|tauri scroll PIXELS [REPEATS]
import AppKit
import ApplicationServices

let args = CommandLine.arguments
guard args.count >= 3, ["gpui", "tauri"].contains(args[1]) else {
    fatalError("Specify gpui|tauri and click|type|key")
}
let owner = "htmd-\(args[1])"
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []
let targetPid = ProcessInfo.processInfo.environment["HTMD_NATIVE_PID"].flatMap(Int32.init)
guard let window = windows.first(where: { ($0[kCGWindowOwnerName as String] as? String) == owner && (targetPid == nil || ($0[kCGWindowOwnerPID as String] as? Int32) == targetPid) }),
      let pid = window[kCGWindowOwnerPID as String] as? Int32,
      let bounds = window[kCGWindowBounds as String] as? [String: Double] else {
    fatalError("Start mise run run:\(args[1]) first")
}
guard CGPreflightPostEventAccess() else { fatalError("Event posting permission is unavailable") }
let app = AXUIElementCreateApplication(pid)
AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
RunLoop.current.run(until: Date().addingTimeInterval(0.2))
guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { fatalError("PoC window could not be activated") }
let source = CGEventSource(stateID: .privateState)

func key(_ code: CGKeyCode, flags: CGEventFlags = [], text: String? = nil) {
    for down in [true, false] {
        let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down)!
        event.flags = flags
        if let text = text {
            let utf16 = Array(text.utf16)
            event.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
        }
        event.post(tap: .cghidEventTap)
    }
}

switch args[2] {
case "click":
    guard args.count == 5, let x = Double(args[3]), let y = Double(args[4]) else { fatalError("click X Y") }
    let point = CGPoint(x: (bounds["X"] ?? 0) + x, y: (bounds["Y"] ?? 0) + y)
    for kind in [CGEventType.mouseMoved, .leftMouseDown, .leftMouseUp] {
        CGEvent(mouseEventSource: source, mouseType: kind, mouseCursorPosition: point, mouseButton: .left)!.post(tap: .cghidEventTap)
        usleep(50_000)
    }
case "type":
    guard args.count == 4 else { fatalError("type TEXT") }
    for char in args[3] { key(0, text: String(char)); usleep(12_000) }
case "scroll":
    guard (4...5).contains(args.count), let delta = Int32(args[3]) else { fatalError("scroll PIXELS [REPEATS]") }
    let point = CGPoint(x: (bounds["X"] ?? 0) + 700, y: (bounds["Y"] ?? 0) + 500)
    CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)!.post(tap: .cghidEventTap)
    usleep(50_000)
    for _ in 0..<(args.count == 5 ? Int(args[4])! : 1) {
        CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 1, wheel1: delta, wheel2: 0, wheel3: 0)!.post(tap: .cghidEventTap)
        usleep(10_000)
    }
case "key":
    guard args.count == 4 else { fatalError("key save|undo|start|end|down|up|left|right|enter|backspace|selectall") }
    let command: String
    switch args[3] {
    case "save": command = "key code 1 using command down"
    case "undo": command = "key code 6 using command down"
    case "start": command = "key code 126 using command down"
    case "down": command = "key code 125"
    case "up": command = "key code 126"
    case "left": command = "key code 123"
    case "right": command = "key code 124"
    case "enter": command = "key code 36"
    case "backspace": command = "key code 51"
    case "selectall": command = "key code 0 using command down"
    case "end": command = "key code 124 using command down"
    default: fatalError("Unknown key")
    }
    // System Events supplies the native special-key characters and modifiers.
    var error: NSDictionary?
    NSAppleScript(source: "tell application \"System Events\" to \(command)")!.executeAndReturnError(&error)
    if let error = error { fatalError("\(error)") }
default: fatalError("Unknown action")
}
print("Sent \(args[2]) to \(owner) pid=\(pid), window=\(window[kCGWindowNumber as String] ?? "?")")
