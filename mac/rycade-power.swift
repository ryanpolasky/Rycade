// rycade-power: Rycade Cabinet F17/F18 (or POST /power/sleep) -> display wake/sleep, streamed to the frontend over SSE on 127.0.0.1:8788.
// Also keeps a black backdrop over the desktop so a kiosk restart never shows the wallpaper, and takes the
// volume keys (with Accessibility) so the menu draws its own volume bar instead of the macOS one.
import AppKit
import CoreGraphics
import Darwin
import Foundation
import IOKit.hid
import Network

let powerOn = 0x6C, powerOff = 0x6D
let liveKey: UInt8 = 0x6E
var asleep = false
let offFile = NSHomeDirectory() + "/Rycade/off"
let volumeFile = NSHomeDirectory() + "/Rycade/volume"
let kioskPIDFile = NSHomeDirectory() + "/Rycade/kiosk.pid"
var clients: [NWConnection] = []
var lastHeal = Date.distantPast
var cursorHidden = false
var cursorError: CGError?
var liveHeld = false
var liveTimer: Timer?

func log(_ message: String) {
    NSLog("rycade-power: %@", message)
}

func enableBackgroundCursor() {
    typealias Connection = @convention(c) () -> Int32
    typealias SetProperty = @convention(c) (Int32, Int32, UnsafeRawPointer, UnsafeRawPointer) -> Int32
    guard let skyLight = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY) else {
        log("Background cursor API unavailable; using browser cursor hiding")
        return
    }
    defer { dlclose(skyLight) }
    guard let defaultConnection = dlsym(skyLight, "_CGSDefaultConnection"),
          let setProperty = dlsym(skyLight, "CGSSetConnectionProperty") else {
        log("Background cursor API unavailable; using browser cursor hiding")
        return
    }
    let connection = unsafeBitCast(defaultConnection, to: Connection.self)()
    let set = unsafeBitCast(setProperty, to: SetProperty.self)
    let key = "SetsCursorInBackground" as CFString
    let result = set(connection, connection, Unmanaged.passUnretained(key).toOpaque(),
                     Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
    log("Background cursor permission result: \(result)")
}

func kioskIsFrontmost() -> Bool {
    guard let app = NSWorkspace.shared.frontmostApplication, app.bundleIdentifier == "com.google.Chrome",
          let saved = try? String(contentsOfFile: kioskPIDFile, encoding: .utf8),
          let pid = pid_t(saved.trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
    return app.processIdentifier == pid
}

func setCursorHidden(_ hidden: Bool, reason: String, quiet: Bool = false) {
    guard hidden != cursorHidden else { return }
    let result = hidden ? CGDisplayHideCursor(CGMainDisplayID()) : CGDisplayShowCursor(CGMainDisplayID())
    if result == .success {
        cursorHidden = hidden
        cursorError = nil
        if !quiet { log("Native cursor \(hidden ? "hidden" : "released") (\(reason))") }
    } else if cursorError != result {
        cursorError = result
        log("Native cursor \(hidden ? "hide" : "release") failed (\(reason)): \(result.rawValue)")
    }
}

func syncCursor(_ reason: String, reassert: Bool = false, quiet: Bool = false) {
    let shouldHide = !asleep && kioskIsFrontmost()
    let refreshing = reassert && shouldHide && cursorHidden
    if refreshing { setCursorHidden(false, reason: reason, quiet: true) }
    setCursorHidden(shouldHide, reason: reason, quiet: refreshing && quiet)
}

func run(_ path: String, _ args: String...) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: path)
    p.arguments = args
    try? p.run()
}

func broadcast(_ event: String) {
    let data = "data: \(event)\n\n".data(using: .utf8)!
    for c in clients { c.send(content: data, completion: .contentProcessed { _ in }) }
}

func sleepCab() {
    guard !asleep else { return }
    asleep = true
    setLive(false)
    syncCursor("sleep")
    FileManager.default.createFile(atPath: offFile, contents: nil)
    broadcast("sleep")
    run("/usr/bin/osascript", "-e", "set volume output muted true")
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { run("/usr/bin/pmset", "displaysleepnow") }
}

func wakeCab() {
    guard asleep else { return }
    asleep = false
    try? FileManager.default.removeItem(atPath: offFile)
    run("/usr/bin/caffeinate", "-u", "-t", "2")
    run("/usr/bin/osascript", "-e", "set volume output muted false")
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
        broadcast("wake")
        syncCursor("wake", reassert: true)
    }
}

func tidyKiosk(restart: Bool, auto: Bool) {
    run("/usr/bin/killall", "NotificationCenter")
    guard restart, !auto || Date().timeIntervalSince(lastHeal) > 600 else {
        syncCursor("kiosk repair", reassert: true)
        return
    }
    lastHeal = Date()
    setCursorHidden(false, reason: "kiosk restart")
    run("/bin/launchctl", "kickstart", "-k", "gui/\(getuid())/com.rycade.kiosk")
}

func setLive(_ down: Bool) {
    guard down != liveHeld else { return }
    liveHeld = down
    liveTimer?.invalidate()
    liveTimer = nil
    guard down, !asleep else { return }
    liveTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { _ in
        liveTimer = nil
        guard liveHeld, !asleep else { return }
        let restart = !kioskIsFrontmost()
        log("LIVE hold: \(restart ? "restart kiosk outside foreground" : "repair foreground kiosk")")
        if !restart { broadcast("kiosk-reset") }
        tidyKiosk(restart: restart, auto: false)
    }
}

func volumeLevel() -> Int {
    guard let saved = try? String(contentsOfFile: volumeFile, encoding: .utf8),
          let level = Int(saved.trimmingCharacters(in: .whitespacesAndNewlines)),
          (0...10).contains(level) else { return 10 }
    return level
}

func stepVolume(_ delta: Int) {
    let level = max(0, min(10, volumeLevel() + delta))
    try? "\(level)\n".write(toFile: volumeFile, atomically: true, encoding: .utf8)
    broadcast("volume:\(level)")
}

if FileManager.default.fileExists(atPath: offFile) { sleepCab() }

// NX_SYSDEFINED (14) subtype 8 carries media keys; NX_KEYTYPE_SOUND_UP/DOWN are 0/1. Swallowing them stops the macOS bezel.
// While the cab is off a volume press wakes it like a button would, since the press wakes the display anyway.
var volumeTap: CFMachPort?
volumeTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap, eventsOfInterest: CGEventMask(1 << 14), callback: { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap = volumeTap { CGEvent.tapEnable(tap: tap, enable: true) }
        return Unmanaged.passUnretained(event)
    }
    guard let media = NSEvent(cgEvent: event), media.subtype.rawValue == 8 else { return Unmanaged.passUnretained(event) }
    let key = (media.data1 & 0xFFFF0000) >> 16, down = (media.data1 & 0xFF00) >> 8 == 0xA
    guard key == 0 || key == 1 else { return Unmanaged.passUnretained(event) }
    if down && asleep { wakeCab() } else if down { stepVolume(key == 0 ? 1 : -1) }
    return nil
}, userInfo: nil)
if let tap = volumeTap {
    CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0), .commonModes)
} else {
    FileHandle.standardError.write("rycade-power: no Accessibility permission, volume keys stay with macOS\n".data(using: .utf8)!)
}

let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
IOHIDManagerSetDeviceMatchingMultiple(manager, [0x4004, 0x4005, 0x4006, 0x4007].map {
    [kIOHIDVendorIDKey: 0xCAFE, kIOHIDProductIDKey: $0] as CFDictionary
} as CFArray)
IOHIDManagerRegisterInputValueCallback(manager, { _, _, _, value in
    let element = IOHIDValueGetElement(value)
    guard IOHIDValueGetIntegerValue(value) == 1 else { return }
    let page = Int(IOHIDElementGetUsagePage(element)), usage = Int(IOHIDElementGetUsage(element))
    if page == kHIDPage_KeyboardOrKeypad && usage == powerOff { sleepCab() }
    else if page == kHIDPage_KeyboardOrKeypad && usage == powerOn { wakeCab() }
    else if page == kHIDPage_Button && asleep { wakeCab() }
}, nil)
IOHIDManagerRegisterInputReportCallback(manager, { _, result, _, _, reportID, report, count in
    guard result == kIOReturnSuccess, reportID == 1 else { return }
    let keys = UnsafeBufferPointer(start: report, count: count)
    if count == 3 { setLive(keys.contains(liveKey)) }
    else if count == 4, keys[0] == 1 { setLive(keys.dropFirst().contains(liveKey)) }
}, nil)
IOHIDManagerRegisterDeviceRemovalCallback(manager, { _, _, _ in setLive(false) }, nil)
IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
let hidResult = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
if hidResult != kIOReturnSuccess { log("Cabinet HID open failed: \(hidResult); check Input Monitoring") }

let params = NWParameters.tcp
params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 8788)
let listener = try! NWListener(using: params)
listener.newConnectionHandler = { c in
    c.start(queue: .main)
    c.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, _, _ in
        let line = data.map { String(decoding: $0, as: UTF8.self).prefix { !$0.isNewline } } ?? ""
        if line.hasPrefix("POST /power/sleep") || line.hasPrefix("POST /power/kiosk") || line.hasPrefix("POST /power/cursor ") {
            c.send(content: "HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n".data(using: .utf8), completion: .contentProcessed { _ in c.cancel() })
            if line.hasPrefix("POST /power/sleep") { sleepCab() }
            else if line.hasPrefix("POST /power/cursor ") { syncCursor("game exit", reassert: true) }
            else { tidyKiosk(restart: line.contains("restart"), auto: line.contains("auto")) }
            return
        }
        let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\nretry: 2000\n\ndata: \(asleep ? "sleep" : "wake")\n\n"
        c.send(content: head.data(using: .utf8), completion: .contentProcessed { _ in })
        clients.append(c)
        c.send(content: "data: level:\(volumeLevel())\n\n".data(using: .utf8), completion: .contentProcessed { _ in })
    }
    c.stateUpdateHandler = { state in
        switch state {
        case .failed, .cancelled: clients.removeAll { $0 === c }
        default: break
        }
    }
}
listener.start(queue: .main)
Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { _ in
    for c in clients { c.send(content: ": ping\n\n".data(using: .utf8), completion: .contentProcessed { _ in }) }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
enableBackgroundCursor()
let backdrop = NSWindow(contentRect: NSScreen.main?.frame ?? .zero, styleMask: .borderless, backing: .buffered, defer: false)
backdrop.backgroundColor = .black
backdrop.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
backdrop.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
backdrop.ignoresMouseEvents = true
backdrop.orderFrontRegardless()
NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { _ in
    if let frame = NSScreen.main?.frame { backdrop.setFrame(frame, display: true) }
    syncCursor("display change", reassert: true)
}
let workspace = NSWorkspace.shared.notificationCenter
workspace.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { _ in
    syncCursor("application focus")
}
workspace.addObserver(forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main) { _ in
    syncCursor("display wake", reassert: true)
}
Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in
    syncCursor("kiosk watchdog", reassert: true, quiet: true)
}
syncCursor("helper startup")
app.run()
