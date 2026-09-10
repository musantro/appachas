import { expect, it, vi } from "vitest";
import {
  entryLinks,
  forgetEntryLinks,
  rememberEntryLinks,
} from "../../src/lib/access";

it("keeps the creation links in memory and removes them when the group closes", () => {
  // Arrange / Given
  const persist = vi.spyOn(Storage.prototype, "setItem");
  const links = {
    creatorUrl: "https://example.test/g#private-fixture",
    memberUrl: "https://example.test/g#member-fixture",
  };
  // Act / When
  rememberEntryLinks("fixture-group", links);
  // Assert / Then
  expect(entryLinks("fixture-group")).toEqual(links);
  expect(persist).not.toHaveBeenCalled();
  forgetEntryLinks("fixture-group");
  expect(entryLinks("fixture-group")).toEqual({});
});
