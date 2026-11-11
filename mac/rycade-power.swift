// rycade-power: Rycade Cabinet F17/F18 (or POST /power/sleep) -> display wake/sleep, streamed to the frontend over SSE on 127.0.0.1:8788.
// Also keeps a black backdrop over the desktop so a kiosk restart never shows the wallpaper, and takes the
// volume keys (with Accessibility) so the menu draws its own volume bar instead of the macOS one.
import AppKit
import CoreAudio
import CoreGraphics
import Foundation
import IOKit.hid
import Network

let powerOn = 0x6C, powerOff = 0x6D
var asleep = false
let offFile = NSHomeDirectory() + "/Rycade/off"
var clients: [NWConnection] = []
var lastHeal = Date.distantPast

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
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { broadcast("wake") }
}

func tidyKiosk(restart: Bool, auto: Bool) {
    run("/usr/bin/killall", "NotificationCenter")
    let screen = CGDisplayBounds(CGMainDisplayID())
    _ = CGWarpMouseCursorPosition(CGPoint(x: screen.maxX - 1, y: screen.maxY - 1))
    guard restart, !auto || Date().timeIntervalSince(lastHeal) > 600 else { return }
    lastHeal = Date()
    run("/bin/launchctl", "kickstart", "-k", "gui/\(getuid())/com.rycade.kiosk")
}

func outputVolume(_ device: AudioObjectID, _ channel: UInt32, _ set: Float32? = nil) -> Float32? {
    var address = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyVolumeScalar, mScope: kAudioDevicePropertyScopeOutput, mElement: channel)
    var value = set ?? 0, size = UInt32(MemoryLayout<Float32>.size)
    if set == nil { return AudioObjectGetPropertyData(device, &address, 0, nil, &size, &value) == noErr ? value : nil }
    var settable: DarwinBoolean = false
    guard AudioObjectIsPropertySettable(device, &address, &settable) == noErr, settable.boolValue else { return nil }
    return AudioObjectSetPropertyData(device, &address, 0, nil, size, &value) == noErr ? value : nil
}

func stepVolume(_ delta: Int) {
    var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultOutputDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var device = AudioObjectID(0), size = UInt32(MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device) == noErr else { return }
    let channels: [UInt32] = outputVolume(device, kAudioObjectPropertyElementMain) != nil ? [kAudioObjectPropertyElementMain] : [1, 2]
    guard let current = outputVolume(device, channels[0]) else { return broadcast("volume:none") }
    let level = max(0, min(16, Int((current * 16).rounded()) + delta))
    for channel in channels { _ = outputVolume(device, channel, Float32(level) / 16) }
    if level > 0 {
        var mute = UInt32(0)
        address = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyMute, mScope: kAudioDevicePropertyScopeOutput, mElement: kAudioObjectPropertyElementMain)
        AudioObjectSetPropertyData(device, &address, 0, nil, UInt32(MemoryLayout<UInt32>.size), &mute)
    }
    broadcast("volume:\(level)")
}

if FileManager.default.fileExists(atPath: offFile) { sleepCab() }

// NX_SYSDEFINED (14) subtype 8 carries media keys; NX_KEYTYPE_SOUND_UP/DOWN are 0/1. Swallowing them stops the macOS bezel.
var volumeTap: CFMachPort?
volumeTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap, eventsOfInterest: CGEventMask(1 << 14), callback: { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap = volumeTap { CGEvent.tapEnable(tap: tap, enable: true) }
        return Unmanaged.passUnretained(event)
    }
    guard let media = NSEvent(cgEvent: event), media.subtype.rawValue == 8 else { return Unmanaged.passUnretained(event) }
    let key = (media.data1 & 0xFFFF0000) >> 16, down = (media.data1 & 0xFF00) >> 8 == 0xA
    guard key == 0 || key == 1 else { return Unmanaged.passUnretained(event) }
    if down && !asleep { stepVolume(key == 0 ? 1 : -1) }
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
IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))

let params = NWParameters.tcp
params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 8788)
let listener = try! NWListener(using: params)
listener.newConnectionHandler = { c in
    c.start(queue: .main)
    c.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, _, _ in
        let line = data.map { String(decoding: $0, as: UTF8.self).prefix { !$0.isNewline } } ?? ""
        if line.hasPrefix("POST /power/sleep") || line.hasPrefix("POST /power/kiosk") {
            c.send(content: "HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n".data(using: .utf8), completion: .contentProcessed { _ in c.cancel() })
            if line.hasPrefix("POST /power/sleep") { sleepCab() }
            else { tidyKiosk(restart: line.contains("restart"), auto: line.contains("auto")) }
            return
        }
        let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\nretry: 2000\n\ndata: \(asleep ? "sleep" : "wake")\n\n"
        c.send(content: head.data(using: .utf8), completion: .contentProcessed { _ in })
        clients.append(c)
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
let backdrop = NSWindow(contentRect: NSScreen.main?.frame ?? .zero, styleMask: .borderless, backing: .buffered, defer: false)
backdrop.backgroundColor = .black
backdrop.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
backdrop.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
backdrop.ignoresMouseEvents = true
backdrop.orderFrontRegardless()
NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { _ in
    if let frame = NSScreen.main?.frame { backdrop.setFrame(frame, display: true) }
}
app.run()
