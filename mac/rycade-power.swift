// rycade-power: Rycade Cabinet F17/F18 -> display wake/sleep, streamed to the frontend over SSE on 127.0.0.1:8788.
import Foundation
import IOKit.hid
import Network

let powerOn = 0x6C, powerOff = 0x6D
var asleep = false
let offFile = NSHomeDirectory() + "/Rycade/off"
var clients: [NWConnection] = []

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

if FileManager.default.fileExists(atPath: offFile) { sleepCab() }

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
    c.receive(minimumIncompleteLength: 1, maximumLength: 4096) { _, _, _, _ in
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
RunLoop.main.run()
