import { describe, expect, it } from "vitest";
import { createSchemaSql } from "../../../server/db/schema";

describe("schema", () => {
  it("contains projects table creation", () => {
    const sql = createSchemaSql();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS projects");
    expect(sql).toContain("deployment_root_path TEXT");
    expect(sql).toContain("runtime_pid INTEGER");
    expect(sql).toContain("runtime_port INTEGER");
  });
});
