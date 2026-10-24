// Renders the library tools' icons (icons/svg/<tool>.svg) to the PNG the app format allows, puts each into its tool
// as `app.iconData` and draws the contact sheet (icons/README.md).
//
//   swift icons/render.swift           write png/<tool>.png, each tool's app.iconData and contact-sheet.png
//   swift icons/render.swift --check   render in memory; fail when a PNG or an app.iconData differs
//
// Only macOS's own frameworks: AppKit draws the SVG (CoreSVG), and this script writes every PNG itself (IHDR, sRGB,
// one IDAT through the Compression framework's zlib, IEND; no time or text chunk), so the same SVG on the same macOS
// gives the same bytes.

import AppKit
import Compression
import Foundation

/// The side of an icon: the app keeps exactly this size, so it never resamples.
let side = 192

/// The app format's limit for `app.iconData`, in bytes.
let maxBytes = 32_768

let icons = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let tools = icons.deletingLastPathComponent().appendingPathComponent("apps/library")
let checking = CommandLine.arguments.contains("--check")
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("render.swift: \(message)\n".utf8))
    exit(1)
}

/// Straight (not premultiplied) RGBA pixels, row by row.
struct Pixels {
    let width: Int
    let height: Int
    var rgba: [UInt8]
}

// MARK: Drawing

/// The pixels a [draw] into an sRGB context of [width] × [height] leaves, un-premultiplied.
func pixels(width: Int, height: Int, flipped: Bool = false, _ draw: (CGContext) -> Void) -> Pixels {
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    rgba.withUnsafeMutableBytes { buffer in
        let context = CGContext(
            data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue,
        )!
        context.interpolationQuality = .high
        context.setShouldAntialias(true)
        if flipped {
            context.translateBy(x: 0, y: CGFloat(height))
            context.scaleBy(x: 1, y: -1)
        }
        draw(context)
    }
    for i in stride(from: 0, to: rgba.count, by: 4) {
        let alpha = Int(rgba[i + 3])
        if alpha == 0 || alpha == 255 { continue }
        for c in 0..<3 { rgba[i + c] = UInt8(min(255, (Int(rgba[i + c]) * 255 + alpha / 2) / alpha)) }
    }
    return Pixels(width: width, height: height, rgba: rgba)
}

/// What an icon's SVG may not hold: anything that reaches outside the file or runs (a link, an embedded image, script,
/// foreign content, a `url()` other than the file's own `#id`), and any document type or entity declaration (an
/// external entity reads another file, an internal one can expand without end), so the renderer reads nothing but the
/// SVG itself.
let outside = [
    #"href"#, #"<image"#, #"<script"#, #"<foreignObject"#, #"url\((?!#)"#, #"@import"#, #"<!DOCTYPE"#, #"<!ENTITY"#,
]

/// The SVG drawn on a transparent square of [side].
func render(_ svg: URL) -> Pixels {
    let source = (try? String(contentsOf: svg, encoding: .utf8)) ?? ""
    for pattern in outside where source.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil {
        fail("\(svg.lastPathComponent) holds \(pattern): an icon's SVG draws only its own shapes")
    }
    guard let image = NSImage(contentsOf: svg) else { fail("\(svg.lastPathComponent) does not read as an image") }
    return pixels(width: side, height: side) { context in
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
        image.draw(in: NSRect(x: 0, y: 0, width: side, height: side))
        NSGraphicsContext.restoreGraphicsState()
    }
}

func image(_ pixels: Pixels) -> CGImage {
    CGImage(
        width: pixels.width, height: pixels.height, bitsPerComponent: 8, bitsPerPixel: 32,
        bytesPerRow: pixels.width * 4, space: sRGB, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
        provider: CGDataProvider(data: Data(pixels.rgba) as CFData)!, decode: nil, shouldInterpolate: true,
        intent: .defaultIntent,
    )!
}

// MARK: PNG

let crcTable: [UInt32] = (0..<256).map { n in
    var c = UInt32(n)
    for _ in 0..<8 { c = (c & 1) != 0 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
    return c
}

func crc32(_ bytes: [UInt8]) -> UInt32 {
    var c: UInt32 = 0xFFFF_FFFF
    for b in bytes { c = crcTable[Int((c ^ UInt32(b)) & 0xFF)] ^ (c >> 8) }
    return c ^ 0xFFFF_FFFF
}

func bigEndian(_ value: UInt32) -> [UInt8] {
    [UInt8(value >> 24), UInt8((value >> 16) & 0xFF), UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)]
}

func chunk(_ type: String, _ data: [UInt8]) -> [UInt8] {
    let body = Array(type.utf8) + data
    return bigEndian(UInt32(data.count)) + body + bigEndian(crc32(body))
}

/// The zlib stream (RFC 1950) of [data]: header, the Compression framework's raw DEFLATE, Adler-32.
func zlib(_ data: [UInt8]) -> [UInt8] {
    var output = [UInt8](repeating: 0, count: data.count + 1024)
    let written = output.withUnsafeMutableBufferPointer { out in
        data.withUnsafeBufferPointer { input in
            compression_encode_buffer(out.baseAddress!, out.count, input.baseAddress!, input.count, nil, COMPRESSION_ZLIB)
        }
    }
    if written == 0 { fail("DEFLATE failed") }
    var a: UInt32 = 1
    var b: UInt32 = 0
    for byte in data {
        a = (a + UInt32(byte)) % 65521
        b = (b + a) % 65521
    }
    return [0x78, 0x9C] + output[0..<written] + bigEndian((b << 16) | a)
}

func paeth(_ a: Int, _ b: Int, _ c: Int) -> Int {
    let p = a + b - c
    let pa = abs(p - a), pb = abs(p - b), pc = abs(p - c)
    return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)
}

/// A PNG of [pixels]: truecolour (RGB) when every pixel is opaque, else truecolour with alpha. Each row takes the
/// filter whose bytes sum the smallest as signed values (the usual heuristic).
func png(_ pixels: Pixels) -> [UInt8] {
    let rgba = pixels.rgba
    let opaque = stride(from: 3, to: rgba.count, by: 4).allSatisfy { rgba[$0] == 255 }
    let channels = opaque ? 3 : 4
    let stride = pixels.width * channels
    var filtered = [UInt8]()
    filtered.reserveCapacity(pixels.height * (stride + 1))
    var up = [UInt8](repeating: 0, count: stride)
    var out = [UInt8](repeating: 0, count: stride)
    var best = [UInt8](repeating: 0, count: stride)
    for y in 0..<pixels.height {
        var row = [UInt8]()
        row.reserveCapacity(stride)
        for x in 0..<pixels.width {
            let i = (y * pixels.width + x) * 4
            row += rgba[i..<(i + channels)]
        }
        var bestFilter = 0
        var bestScore = Int.max
        for filter in 0..<5 {
            var score = 0
            for x in 0..<stride {
                let a = x >= channels ? Int(row[x - channels]) : 0
                let b = Int(up[x])
                let c = x >= channels ? Int(up[x - channels]) : 0
                let predictor: Int
                switch filter {
                case 1: predictor = a
                case 2: predictor = b
                case 3: predictor = (a + b) / 2
                case 4: predictor = paeth(a, b, c)
                default: predictor = 0
                }
                let value = UInt8((Int(row[x]) - predictor) & 0xFF)
                out[x] = value
                score += min(Int(value), 256 - Int(value))
            }
            if score < bestScore {
                bestScore = score
                bestFilter = filter
                swap(&best, &out)
            }
        }
        filtered.append(UInt8(bestFilter))
        filtered += best
        up = row
    }
    let header = bigEndian(UInt32(pixels.width)) + bigEndian(UInt32(pixels.height)) + [8, opaque ? 2 : 6, 0, 0, 0]
    return [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] + chunk("IHDR", header) + chunk("sRGB", [0]) +
        chunk("IDAT", zlib(filtered)) + chunk("IEND", [])
}

// MARK: The tools' definitions

/// The tool's definition file: its app.json, or the index.html whose manifest names it.
func definition(of tool: String) -> URL {
    let folder = tools.appendingPathComponent(tool)
    for name in ["app.json", "index.html"] {
        let file = folder.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: file.path) { return file }
    }
    fail("no library tool \"\(tool)\" (library/apps/library/\(tool)/app.json or index.html)")
}

/// The text of [file] with `app.iconData` set to [base64]: the line replaced when the app block has one, else added as
/// the block's last member. The app block is the `"app": {` whose first member is `"id": "library/<tool>",`.
func withIconData(_ text: String, tool: String, base64: String, file: String) -> String {
    var lines = text.components(separatedBy: "\n")
    guard let id = lines.firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == "\"id\": \"library/\(tool)\"," }),
        id > 0, lines[id - 1].trimmingCharacters(in: .whitespaces) == "\"app\": {"
    else { fail("\(file): no \"app\": { block that starts with \"id\": \"library/\(tool)\",") }
    let indent = String(lines[id].prefix { $0 == " " })
    let outer = String(lines[id - 1].prefix { $0 == " " })
    guard let end = lines[id...].firstIndex(where: { $0 == outer + "}" || $0 == outer + "}," })
    else { fail("\(file): no end of the app block") }
    let member = "\(indent)\"iconData\": \"\(base64)\""
    if let line = lines[id..<end].firstIndex(where: { $0.hasPrefix("\(indent)\"iconData\": ") }) {
        lines[line] = member + (lines[line].hasSuffix(",") ? "," : "")
    } else {
        if !lines[end - 1].hasSuffix(",") { lines[end - 1] += "," }
        lines.insert(member, at: end)
    }
    return lines.joined(separator: "\n")
}

/// The `app.iconData` value [text] holds, or nil.
func iconData(in text: String) -> String? {
    guard let range = text.range(of: #""iconData": "[A-Za-z0-9+/=]*""#, options: .regularExpression) else {
        return nil
    }
    return String(text[range].dropFirst("\"iconData\": \"".count).dropLast())
}

// MARK: The contact sheet

/// A background of the contact sheet: the library screen's sheet as the Android app draws it, in light or dark, with
/// the sticker's keyline and lift in that scheme.
struct Panel {
    let title: String
    let background: CGColor
    let text: CGColor
    let keyline: CGColor
    let lift: CGColor
}

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(
        srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
        blue: CGFloat(hex & 0xFF) / 255, alpha: alpha,
    )
}

let panels = [
    Panel(
        title: "Light: the sheet", background: color(0x3B37DF), text: color(0xFFFFFF), keyline: color(0xFFFFFF),
        lift: color(0x1B1D5E, 0.38),
    ),
    Panel(
        title: "Dark: the sheet", background: color(0x20237E), text: color(0xFFFFFF), keyline: color(0xF3F2FE),
        lift: color(0x000000, 0.6),
    ),
]

/// [image]'s sticker as the app draws it, its top-left corner at [origin], [size] px a side: the keyline 5 % of the
/// side, corners 32 % outside and 27 % on the face, a lift 10 % below, blurred over a fifth and drawn in by 8 %.
func sticker(_ image: CGImage, in context: CGContext, at origin: CGPoint, size: CGFloat, panel: Panel) {
    let outer = CGRect(origin: origin, size: CGSize(width: size, height: size))
    context.saveGState()
    context.setShadow(offset: CGSize(width: 0, height: size * 0.1), blur: size * 0.2, color: panel.lift)
    context.setFillColor(panel.keyline)
    let inset = outer.insetBy(dx: size * 0.08, dy: size * 0.08)
    context.addPath(CGPath(roundedRect: inset, cornerWidth: size * 0.32, cornerHeight: size * 0.32, transform: nil))
    context.fillPath()
    context.restoreGState()
    context.setFillColor(panel.keyline)
    context.addPath(CGPath(roundedRect: outer, cornerWidth: size * 0.32, cornerHeight: size * 0.32, transform: nil))
    context.fillPath()
    let face = outer.insetBy(dx: size * 0.05, dy: size * 0.05)
    context.saveGState()
    context.addPath(CGPath(roundedRect: face, cornerWidth: size * 0.27, cornerHeight: size * 0.27, transform: nil))
    context.clip()
    // CGContext.draw puts an image upright in a y-up space: flip it back inside the face.
    context.translateBy(x: face.minX, y: face.maxY)
    context.scaleBy(x: 1, y: -1)
    context.draw(image, in: CGRect(x: 0, y: 0, width: face.width, height: face.height))
    context.restoreGState()
}

/// Every icon at 192, 96 and 48 px in its sticker, on each panel, with its tool's name.
func contactSheet(_ rendered: [(String, Pixels)]) -> Pixels {
    let column = 232.0, margin = 32.0, header = 56.0
    let panelHeight = header + 192 + 28 + 96 + 40
    let width = Int(margin * 2 + column * Double(rendered.count))
    let height = Int(panelHeight * Double(panels.count))
    let images = rendered.map { ($0.0, image($0.1)) }
    return pixels(width: width, height: height, flipped: true) { context in
        func text(_ string: String, _ point: CGPoint, _ size: CGFloat, _ color: CGColor, bold: Bool = false) {
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
            let font = bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
            NSAttributedString(string: string, attributes: [.font: font, .foregroundColor: NSColor(cgColor: color)!])
                .draw(at: point)
            NSGraphicsContext.restoreGraphicsState()
        }
        for (index, panel) in panels.enumerated() {
            let top = panelHeight * Double(index)
            context.setFillColor(panel.background)
            context.fill(CGRect(x: 0, y: top, width: Double(width), height: panelHeight))
            text(panel.title, CGPoint(x: margin, y: top + 16), 22, panel.text, bold: true)
            for (i, (name, icon)) in images.enumerated() {
                let left = margin + column * Double(i) + (column - 192) / 2
                let row = top + header + 192 + 28
                sticker(icon, in: context, at: CGPoint(x: left, y: top + header), size: 192, panel: panel)
                sticker(icon, in: context, at: CGPoint(x: left, y: row), size: 96, panel: panel)
                sticker(icon, in: context, at: CGPoint(x: left + 128, y: row + 24), size: 48, panel: panel)
                text(name, CGPoint(x: left + 120, y: row - 2), 13, panel.text)
            }
        }
    }
}

// MARK: Main

let svgs = try! FileManager.default
    .contentsOfDirectory(at: icons.appendingPathComponent("svg"), includingPropertiesForKeys: nil)
    .filter { $0.pathExtension == "svg" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }
if svgs.isEmpty { fail("no SVG in library/icons/svg") }

var differs = false
var rendered = [(String, Pixels)]()
for svg in svgs {
    let tool = svg.deletingPathExtension().lastPathComponent
    let pixels = render(svg)
    rendered.append((tool, pixels))
    let bytes = png(pixels)
    if bytes.count > maxBytes { fail("\(tool): \(bytes.count) bytes, over the spec's \(maxBytes)") }
    let base64 = Data(bytes).base64EncodedString()
    let pngFile = icons.appendingPathComponent("png/\(tool).png")
    let file = definition(of: tool)
    let text = try! String(contentsOf: file, encoding: .utf8)
    let report = "\(tool): \(side) × \(side) px, \(bytes.count) bytes, \(base64.count) base64 characters"
    if checking {
        var problems = [String]()
        if (try? Data(contentsOf: pngFile)) != Data(bytes) { problems.append("png/\(tool).png differs from a fresh render") }
        if iconData(in: text) != base64 { problems.append("its app.iconData is not png/\(tool).png") }
        if problems.isEmpty {
            print("ok    \(report)")
        } else {
            differs = true
            print("FAIL  \(tool): " + problems.joined(separator: "; "))
        }
    } else {
        try! Data(bytes).write(to: pngFile)
        let updated = withIconData(text, tool: tool, base64: base64, file: file.lastPathComponent)
        if updated != text { try! updated.write(to: file, atomically: true, encoding: .utf8) }
        print("wrote \(report)")
    }
}
if differs { exit(1) }
if !checking {
    let sheet = png(contactSheet(rendered))
    try! Data(sheet).write(to: icons.appendingPathComponent("contact-sheet.png"))
    print("wrote contact-sheet.png: \(sheet.count) bytes")
}
