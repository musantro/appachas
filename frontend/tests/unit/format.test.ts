import { describe, expect, it } from "vitest";
import {
  entryPath,
  equalAmounts,
  groupPath,
  parseAmount,
} from "../../src/lib/format";

describe("amount inputs", () => {
  it.each([
    ["12,50", 1250],
    ["12.50", 1250],
    ["0,01", 1],
    [" 9 ", 900],
    ["001.9", 190],
  ])("accepts a decimal amount %s as exact cents", (input, expected) => {
    // Arrange / Given: an amount entered with either decimal separator.
    // Act / When
    const result = parseAmount(input);
    // Assert / Then
    expect(result).toBe(expected);
  });
  it.each([
    "",
    "-2",
    "0",
    "0.001",
    "1,234",
    "1e3",
    "Infinity",
    "9999999999999999999999",
    "1.2.3",
  ])("rejects invalid or unsafe total %s", (input) => {
    // Arrange / Given: a value that cannot represent a positive safe cent amount.
    // Act / When
    const result = parseAmount(input);
    // Assert / Then
    expect(result).toBeNull();
  });
  it("allows a zero receiver allocation without allowing a zero movement total", () => {
    // Arrange / Given
    const input = "0,00";
    // Act / When
    const allocation = parseAmount(input, true);
    // Assert / Then
    expect(allocation).toBe(0);
    expect(parseAmount(input)).toBeNull();
  });
  it("prefills contribution receivers in their existing membership order", () => {
    // Arrange / Given
    const receivers = ["first", "second", "third"];
    // Act / When
    const fields = equalAmounts(100, receivers);
    // Assert / Then
    expect(fields).toEqual({ first: "0,34", second: "0,33", third: "0,33" });
  });
  it("keeps the secret out of the route path and query string", () => {
    // Arrange / Given
    const token = "test-link-token";
    // Act / When
    const url = new URL(entryPath(token, "/options"), "https://example.test");
    // Assert / Then
    expect(url.pathname).toBe("/g/options");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#${token}`);
  });
  it("navigates authenticated group pages using a non-secret reference", () => {
    // Arrange / Given
    const id = "11111111-1111-4111-8111-111111111111";
    // Act / When
    const url = new URL(groupPath(id, "/options"), "https://example.test");
    // Assert / Then
    expect(url.pathname).toBe("/g/options");
    expect(url.searchParams.get("group")).toBe(id);
    expect(url.hash).toBe("");
  });
});
