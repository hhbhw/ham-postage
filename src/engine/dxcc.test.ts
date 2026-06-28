import { describe, expect, it } from "vitest";
import { expandRange, resolve, stripAffixes } from "./dxcc";

describe("expandRange", () => {
  it("JA-JS 展开 J A..S 共 19 个", () => {
    const arr = expandRange("JA-JS");
    expect(arr.length).toBe(19); // A..S = 19 字母
    expect(arr[0]).toBe("JA");
    expect(arr[arr.length - 1]).toBe("JS");
  });
  it("单 token 原样", () => {
    expect(expandRange("VR2")).toEqual(["VR2"]);
  });
});

describe("stripAffixes", () => {
  it("JA1ABC/P → JA1ABC", () => {
    expect(stripAffixes("JA1ABC/P")).toBe("JA1ABC");
  });
  it("W2/JA1ABC → W2（前缀型）", () => {
    expect(stripAffixes("W2/JA1ABC")).toBe("W2");
  });
  it("JA1ABC（无斜杠）原样", () => {
    expect(stripAffixes("JA1ABC")).toBe("JA1ABC");
  });
});

describe("resolve", () => {
  it("JA1ABC → 日本", () => {
    const r = resolve("JA1ABC");
    expect(r.entity_en).toBe("Japan");
    expect(r.dest_zh).toBe("日本");
  });
  it("BG7XXX → 中华人民共和国（dest_zh 为 null，但 entity_en 有）", () => {
    const r = resolve("BG7XXX");
    expect(r.entity_en).toContain("China");
  });
  it("W1AW → 美国", () => {
    const r = resolve("W1AW");
    expect(r.dest_zh).toBe("美国");
  });
  it("DL1AA → 德国", () => {
    const r = resolve("DL1AA");
    expect(r.dest_zh).toBe("德国");
  });
  it("未知前缀(QQ) → 全 null", () => {
    const r = resolve("QQ1ABC"); // Q 段未在 IARU 分配给业余
    expect(r.entity_en).toBeNull();
    expect(r.dest_zh).toBeNull();
  });
});
