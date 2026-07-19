import { createSupabaseRestClient, getSupabaseConfig, hasSupabaseConfig } from "../supabase/client.js";

export { getSupabaseConfig, hasSupabaseConfig };

const encodeQueryValue = (value) => encodeURIComponent(String(value));

export class SupabaseRepository {
  constructor({
    table,
    fallbackValue,
    normalize,
    select = "*",
    order = "",
    idField = "id",
    fromRows,
    toRows,
    read,
    write,
  }) {
    this.table = table;
    this.fallbackValue = fallbackValue;
    this.normalize = normalize;
    this.selectColumns = select;
    this.order = order;
    this.idField = idField;
    this.fromRows = fromRows;
    this.toRows = toRows;
    this.customRead = read;
    this.customWrite = write;
    this.config = getSupabaseConfig();
    this.client = createSupabaseRestClient(this.config);
  }

  getFallbackValue() {
    return JSON.parse(JSON.stringify(this.fallbackValue));
  }

  get headers() {
    return {
      apikey: this.config.anonKey,
      Authorization: `Bearer ${this.config.anonKey}`,
      "Content-Type": "application/json",
      ...(this.config.schema
        ? { "Accept-Profile": this.config.schema, "Content-Profile": this.config.schema }
        : {}),
    };
  }

  get tableUrl() {
    return `${this.config.url}/rest/v1/${this.table}`;
  }

  async request(table, { method = "GET", query = "", body = null, prefer = "" } = {}) {
    return this.client.rest(table, {
      method,
      query,
      body,
      prefer,
    });
  }

  async select(table = this.table, { select = "*", filters = "", order = "" } = {}) {
    const queryParts = [`select=${encodeQueryValue(select)}`];
    if (filters) {
      queryParts.push(filters);
    }
    if (order) {
      queryParts.push(`order=${encodeQueryValue(order)}`);
    }

    return this.request(table, { query: `?${queryParts.join("&")}` });
  }

  async upsert(table, rows, { onConflict = "id" } = {}) {
    const safeRows = Array.isArray(rows) ? rows : [rows];
    if (safeRows.length === 0) {
      return [];
    }

    return this.request(table, {
      method: "POST",
      query: `?on_conflict=${encodeQueryValue(onConflict)}`,
      body: safeRows,
      prefer: "resolution=merge-duplicates,return=representation",
    });
  }

  async removeMissing(table, ids, { idField = "id" } = {}) {
    const safeIds = ids.filter(Boolean);
    if (safeIds.length === 0) {
      return null;
    }

    const filter = `${idField}=not.in.(${safeIds.map((id) => `"${String(id).replaceAll('"', '\\"')}"`).join(",")})`;
    return this.request(table, {
      method: "DELETE",
      query: `?${filter}`,
      prefer: "return=minimal",
    });
  }

  async deleteByIds(table, ids, { idField = "id" } = {}) {
    const safeIds = ids.filter(Boolean);
    if (safeIds.length === 0) {
      return null;
    }

    const filter = `${idField}=in.(${safeIds.map((id) => `"${String(id).replaceAll('"', '\\"')}"`).join(",")})`;
    return this.request(table, {
      method: "DELETE",
      query: `?${filter}`,
      prefer: "return=minimal",
    });
  }

  async deleteAll(table, { idField = "id" } = {}) {
    return this.request(table, {
      method: "DELETE",
      query: `?${idField}=not.is.null`,
      prefer: "return=minimal",
    });
  }

  async read() {
    if (this.customRead) {
      const value = await this.customRead(this);
      return this.normalize(value ?? this.getFallbackValue());
    }

    const rows = await this.select(this.table, {
      select: this.selectColumns,
      order: this.order,
    });
    const value = this.fromRows ? this.fromRows(rows || []) : rows;
    return this.normalize(value ?? this.getFallbackValue());
  }

  async write(value) {
    const normalized = this.normalize(value);

    if (this.customWrite) {
      await this.customWrite(normalized, this);
      return true;
    }

    if (!this.toRows) {
      throw new Error("SupabaseRepository requires toRows for generic writes.");
    }

    const rows = this.toRows(normalized);
    if (rows.length === 0) {
      await this.deleteAll(this.table, { idField: this.idField });
      return true;
    }

    await this.upsert(this.table, rows, { onConflict: this.idField });

    if (Array.isArray(normalized)) {
      await this.removeMissing(this.table, normalized.map((item) => item?.[this.idField]), {
        idField: this.idField,
      });
    }

    return true;
  }
}
