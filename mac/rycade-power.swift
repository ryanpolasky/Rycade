// rycade-power: deck power slider -> display sleep/wake, streamed to the frontend over SSE on 127.0.0.1:8788.
import Foundation
import IOKit.hid
import Network

let args = CommandLine.arguments.dropFirst().compactMap { Int($0) }
let offUsage = args.count > 0 ? args[0] : 5
let onUsage = args.count > 1 ? args[1] : 3
let startUsage = 7
var asleep = false
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
    broadcast("sleep")
    run("/usr/bin/osascript", "-e", "set volume output muted true")
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { run("/usr/bin/pmset", "displaysleepnow") }
}

func wakeCab() {
    guard asleep else { return }
    asleep = false
    run("/usr/bin/caffeinate", "-u", "-t", "2")
    run("/usr/bin/osascript", "-e", "set volume output muted false")
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { broadcast("wake") }
}

func isP1(_ device: IOHIDDevice) -> Bool {
    let service = IOHIDDeviceGetService(device)
    let number = IORegistryEntrySearchCFProperty(service, kIOServicePlane, "bInterfaceNumber" as CFString, kCFAllocatorDefault,
                                                IOOptionBits(kIORegistryIterateRecursively | kIORegistryIterateParents))
    return (number as? Int) == 0
}

let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
IOHIDManagerSetDeviceMatching(manager, [kIOHIDVendorIDKey: 0xCAFE, kIOHIDProductIDKey: 0x4004] as CFDictionary)
IOHIDManagerRegisterInputValueCallback(manager, { _, _, _, value in
    let element = IOHIDValueGetElement(value)
    guard isP1(IOHIDElementGetDevice(element)) else { return }
    guard IOHIDElementGetUsagePage(element) == UInt32(kHIDPage_Button), IOHIDValueGetIntegerValue(value) == 1 else { return }
    switch Int(IOHIDElementGetUsage(element)) {
    case offUsage: sleepCab()
    case onUsage, startUsage: wakeCab()
    default: if asleep { wakeCab() }
    }
}, nil)
IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))

let params = NWParameters.tcp
params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 8788)
let listener = try! NWListener(using: params)
listener.newConnectionHandler = { c in
    c.start(queue: .main)
    c.receive(minimumIncompleteLength: 1, maximumLength: 4096) { _, _, _, _ in
        let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\nretry: 2000\n\n"
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
