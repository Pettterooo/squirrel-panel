// 用 AppKit 复现 Squirrel 1.1.2 的 font_face 解析，让网页预览使用同一套字体。
// 用法：swift tools/fontprobe.swift "PingFang SC"
// 输出：{"fonts":[{"postscript":"PingFangSC-Regular","family":"PingFang SC"}],
//        "fallback":false,"fallbackName":"Helvetica","lineHeightRatio":1.4166}
import AppKit
import Foundation

struct FontEntry: Codable {
  let postscript: String
  let family: String
}

struct Result: Codable {
  let fonts: [FontEntry]
  let fallback: Bool
  let fallbackName: String
  let lineHeightRatio: Double
}

let raw = CommandLine.arguments.dropFirst().joined(separator: " ")
let input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
guard !input.isEmpty else {
  print("{\"error\":\"missing font name\"}")
  exit(2)
}

func entry(for font: NSFont) -> FontEntry {
  FontEntry(postscript: font.fontName, family: font.familyName ?? font.fontName)
}

let facePattern = try! NSRegularExpression(pattern: "^\\s*(.+)-([^-]+)\\s*$")
var entries: [FontEntry] = []
var seen = Set<String>()

for part in input.split(separator: ",") {
  let name = part.trimmingCharacters(in: .whitespaces)
  guard !name.isEmpty else { continue }

  let range = NSRange(name.startIndex..., in: name)
  if let match = facePattern.firstMatch(in: name, range: range),
     let familyRange = Range(match.range(at: 1), in: name),
     let faceRange = Range(match.range(at: 2), in: name) {
    let family = String(name[familyRange])
    let face = String(name[faceRange])
    if !seen.contains(family) {
      let descriptor = NSFontDescriptor(fontAttributes: [.family: family, .face: face])
      if let font = NSFont(descriptor: descriptor, size: 12) {
        entries.append(entry(for: font))
        seen.insert(family)
        continue
      }
    } else {
      continue
    }
  }

  if seen.contains(name) { continue }
  let descriptor = NSFontDescriptor(fontAttributes: [.name: name])
  if let font = NSFont(descriptor: descriptor, size: 12) {
    entries.append(entry(for: font))
    seen.insert(name)
  }
}

let fallbackFont = NSFont.userFont(ofSize: 12) ?? NSFont.systemFont(ofSize: 12)
let fallback = entries.isEmpty
if fallback {
  entries = [entry(for: fallbackFont)]
}

func rounded(_ value: CGFloat) -> Double { Double(round(value * 10000) / 10000) }

let base = NSFont(name: entries[0].postscript, size: 12) ?? fallbackFont
let ratio = rounded(NSLayoutManager().defaultLineHeight(for: base) / 12.0)

let result = Result(
  fonts: entries,
  fallback: fallback,
  fallbackName: fallbackFont.fontName,
  lineHeightRatio: ratio
)
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
if let data = try? encoder.encode(result), let text = String(data: data, encoding: .utf8) {
  print(text)
} else {
  print("{\"error\":\"encoding failed\"}")
  exit(1)
}
