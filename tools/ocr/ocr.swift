// macOS 本地 OCR：用 Vision 识别图片文字，输出「y坐标 x坐标 文本」按行分组。
// 不依赖网络与第三方服务，供学情录入把纸质表格照片转成结构化文本。
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count > 1 else {
    FileHandle.standardError.write("usage: ocr <image> [--plain]\n".data(using: .utf8)!)
    exit(2)
}
let path = args[1]
let plain = args.contains("--plain")

guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("cannot load image: \(path)\n".data(using: .utf8)!)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true
// 手写体识别支持（macOS 14+），失败时忽略
if #available(macOS 14.0, *) {
    request.automaticallyDetectsLanguage = true
}

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
    try handler.perform([request])
} catch {
    FileHandle.standardError.write("ocr failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}

struct Line { var y: Double; var text: [String]; var xs: [Double] }

var lines: [Line] = []
let results = request.results ?? []
for obs in results {
    guard let cand = obs.topCandidates(1).first else { continue }
    let box = obs.boundingBox
    let y = Double(box.midY)
    let x = Double(box.minX)
    let text = cand.string
    if text.trimmingCharacters(in: .whitespaces).isEmpty { continue }
    // 同一行（y 接近）合并，按 x 排序
    if let idx = lines.firstIndex(where: { abs($0.y - y) < 0.012 }) {
        lines[idx].text.append(text)
        lines[idx].xs.append(x)
    } else {
        lines.append(Line(y: y, text: [text], xs: [x]))
    }
}

// 从上到下（Vision 的 y 原点在左下）
lines.sort { $0.y > $1.y }
for line in lines {
    let pairs = zip(line.xs, line.text).sorted { $0.0 < $1.0 }
    let merged = pairs.map { $0.1 }.joined(separator: "  ")
    if plain {
        print(merged)
    } else {
        print(String(format: "%.3f\t%@", line.y, merged))
    }
}
