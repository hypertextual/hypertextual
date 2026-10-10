// External macOS driver: CGEvent dispatch to a changed compositor-visible marker.
// Never opens the checked-in vault; the caller supplies an isolated fixture vault.
import AppKit
import ApplicationServices
import QuartzCore

struct Action: Decodable { let kind: String; let label: String; let x: Double?; let y: Double?; let text: String?; let code: UInt16?; let command: Bool?; let seconds: Double? }
struct Plan: Decodable { let binary: String; let vault: String; let actions: [Action] }
let plan = try JSONDecoder().decode(Plan.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
func emit(_ data: [String: Any]) { let bytes = try! JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]); print(String(data: bytes, encoding: .utf8)!); fflush(stdout) }
guard CGPreflightPostEventAccess(), CGPreflightScreenCaptureAccess() else { fatalError("Existing event posting and screen capture permissions are required") }
let process = Process(); process.executableURL = URL(fileURLWithPath: plan.binary)
process.environment = ProcessInfo.processInfo.environment.merging(["HTMD_VAULT": plan.vault, "HTMD_BENCH": "1"], uniquingKeysWith: { _, new in new })
let log = URL(fileURLWithPath: plan.vault).appendingPathComponent("application.log")
FileManager.default.createFile(atPath: log.path, contents: nil)
process.standardOutput = try FileHandle(forWritingTo: log); process.standardError = process.standardOutput
let began = CACurrentMediaTime(); try process.run(); let pid = process.processIdentifier
emit(["kind": "launch", "pid": pid])
var info: [String: Any] = [:]
while CACurrentMediaTime() - began < 40 {
    let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []
    if let found = windows.first(where: { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && (($0[kCGWindowBounds as String] as? [String: Double])?["Height"] ?? 0) > 500 }) { info = found; break }
    if !process.isRunning { fatalError("Application exited; inspect \(log.path)") }
    RunLoop.current.run(until: Date().addingTimeInterval(0.01))
}
guard let windowID = info[kCGWindowNumber as String] as? UInt32,
      let bounds = info[kCGWindowBounds as String] as? [String: Double] else { process.terminate(); fatalError("No main window appeared") }
let app = AXUIElementCreateApplication(pid)
AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
// The 16pt marker is at (328,76) in content coordinates; macOS title bars are 28pt.
let rect = CGRect(x: bounds["X"]! + 328, y: bounds["Y"]! + 104, width: 16, height: 16)
var captureCosts: [Double] = []
func marker() -> Int? {
    let start = CACurrentMediaTime()
    defer { captureCosts.append((CACurrentMediaTime() - start) * 1000) }
    guard let image = CGWindowListCreateImage(rect, .optionIncludingWindow, windowID, [.boundsIgnoreFraming]) else { return nil }
    var pixels = [UInt8](repeating: 0, count: 4)
    return pixels.withUnsafeMutableBytes { data in
        guard let context = CGContext(data: data.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.interpolationQuality = .none; context.draw(image, in: CGRect(x:0,y:0,width:1,height:1))
        let red = Int(data[0]), green = Int(data[1]), blue = Int(data[2])
        return abs(green - 220) < 4 && abs(blue - 90) < 4 && (28...216).contains(red) ? red : nil
    }
}
func waitChange(_ previous: Int?, since start: Double, timeout: Double = 20) -> (Int?, Bool) {
    while CACurrentMediaTime() - start < timeout {
        if let value = marker(), value != previous { return (value, true) }
        RunLoop.current.run(until: Date().addingTimeInterval(0.002))
    }
    return (previous, false)
}
var (last, ready) = waitChange(nil, since: began, timeout: 40)
guard ready else { process.terminate(); fatalError("No benchmark marker; check the build and marker coordinates") }
emit(["kind": "startup", "ms": (CACurrentMediaTime()-began)*1000, "pid": pid, "window": windowID, "width": bounds["Width"]!, "height": bounds["Height"]!])
let source = CGEventSource(stateID: .privateState)
func key(_ code: UInt16, command: Bool = false, text: String? = nil) {
    for down in [true,false] {
        let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down)!
        event.flags = command ? .maskCommand : []
        let special: [UInt16:String] = [126:"\u{f700}",125:"\u{f701}",123:"\u{f702}",124:"\u{f703}"]
        if let text = text ?? special[code] { let utf16 = Array(text.utf16); event.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16) }
        event.post(tap: .cghidEventTap)
    }
}
for action in plan.actions {
    AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { process.terminate(); fatalError("Benchmark lost foreground focus") }
    if action.kind == "idle" {
        emit(["kind":"idle_start", "label":action.label, "pid":pid]); RunLoop.current.run(until: Date().addingTimeInterval(action.seconds ?? 2)); emit(["kind":"idle_end", "label":action.label, "pid":pid]); continue
    }
    if action.kind == "screenshot" { let path = URL(fileURLWithPath: plan.vault).appendingPathComponent(action.label+".png"); if let image = CGWindowListCreateImage(.null, .optionIncludingWindow, windowID, [.boundsIgnoreFraming]) { let bitmap = NSBitmapImageRep(cgImage:image); try bitmap.representation(using:.png,properties:[:])!.write(to:path) }; continue }
    emit(["kind":"action_start", "label":action.label, "action":action.kind, "pid":pid])
    let items = action.kind == "type" ? (action.text ?? "").map(String.init) : [""]
    for (index,text) in items.enumerated() {
        last = marker() ?? last
        var start = CACurrentMediaTime()
        if action.kind == "click" || action.kind == "focus" {
            let point = CGPoint(x: bounds["X"]!+action.x!, y: bounds["Y"]!+action.y!)
            CGEvent(mouseEventSource:source,mouseType:.mouseMoved,mouseCursorPosition:point,mouseButton:.left)!.post(tap:.cghidEventTap)
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
            CGEvent(mouseEventSource:source,mouseType:.leftMouseDown,mouseCursorPosition:point,mouseButton:.left)!.post(tap:.cghidEventTap)
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
            start = CACurrentMediaTime() // Click action dispatches on mouse-up.
            CGEvent(mouseEventSource:source,mouseType:.leftMouseUp,mouseCursorPosition:point,mouseButton:.left)!.post(tap:.cghidEventTap)
        } else if action.kind == "scroll" {
            let point = CGPoint(x:bounds["X"]!+700,y:bounds["Y"]!+500)
            CGEvent(mouseEventSource:source,mouseType:.mouseMoved,mouseCursorPosition:point,mouseButton:.left)!.post(tap:.cghidEventTap)
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
            let wheel = CGEvent(scrollWheelEvent2Source:source,units:.pixel,wheelCount:1,wheel1:action.code == 0 ? -180 : 180,wheel2:0,wheel3:0)!
            wheel.location = point; wheel.flags = []
            start = CACurrentMediaTime(); wheel.post(tap:.cghidEventTap)
        } else { key(action.code ?? 0, command: action.command ?? false, text: action.kind == "type" ? text : nil) }
        if action.kind == "focus" { RunLoop.current.run(until: Date().addingTimeInterval(0.2)); last = marker() ?? last; continue }
        let result = waitChange(last,since:start); last=result.0
        emit(["kind":action.kind,"label":action.label,"sample":index,"ms":(CACurrentMediaTime()-start)*1000,"ok":result.1,"pid":pid])
        if !result.1 {
            if let image = CGWindowListCreateImage(.null,.optionIncludingWindow,windowID,[.boundsIgnoreFraming]) { let bitmap=NSBitmapImageRep(cgImage:image);try! bitmap.representation(using:.png,properties:[:])!.write(to: URL(fileURLWithPath:plan.vault).appendingPathComponent(action.label+"_failed.png")) }
            process.terminate(); fatalError("No visible update for \(action.label)") }
        RunLoop.current.run(until: Date().addingTimeInterval(0.06))
    }
}
let sorted = captureCosts.sorted()
emit(["kind":"capture_overhead","median_ms": sorted[sorted.count/2],"p95_ms": sorted[Int(Double(sorted.count-1)*0.95)],"samples": sorted.count])
process.terminate(); process.waitUntilExit()
emit(["kind":"done","pid":pid])
