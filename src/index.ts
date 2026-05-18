#!/usr/bin/env node
/*
MCP server for Readwise.
Requires the READWISE_TOKEN environment variable.
*/

import { McpServer } from"@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const READWISE_TOKEN = process.env.READWISE_TOKEN;

if (!READWISE_TOKEN) {
	console.error("Error: READWISE_TOKEN is not set in the environment variables.");
	process.exit(1);
}

const READWISE_API_BASE = "https://readwise.io/api/v2";
const USER_AGENT = "mcp-readwise-server/1.0.0";

const server = new McpServer({
    name: "readwise",
    version: "1.0.0",
});

// Helper function to make authenticated requests to the Readwise API
type QueryValue = string | number | boolean | readonly (string | number)[] | undefined;

async function readwiseRequest(
	endpoint: string,
	params?: Record<string, QueryValue>,
	method: string = "GET",
	body?: unknown,
) {
	let url = `${READWISE_API_BASE}${endpoint}`;

	if (params) {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined) continue;
			query.set(key, Array.isArray(value) ? value.join(",") : String(value));
		}
		const qs = query.toString();
		if (qs) url += `?${qs}`;
	}

	const headers: { [key: string]: string } = {
		"Authorization": `Token ${READWISE_TOKEN}`,
		"User-Agent": USER_AGENT,
	};

	const init: RequestInit = { method, headers };
	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
		init.body = JSON.stringify(body);
	}

	const response = await fetch(url, init);
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`Readwise API ${response.status} ${response.statusText}: ${text}`);
	}
	return await response.json();
}


// Progressive discovery: a single catalog of operations is exposed via the
// `list-operations` tool, and any operation is executed via `invoke-operation`.
// This keeps the visible tool surface to just two tools regardless of how
// many Readwise endpoints we cover.

type OperationDef = {
	description: string;
	inputShape: z.ZodRawShape;
	path: (args: Record<string, unknown>) => string;
	pathParams?: readonly string[];
};

const operations: Record<string, OperationDef> = {
	"list-books": {
		description: "List books in the Readwise library (GET /api/v2/books/).",
		inputShape: {
			page_size: z.number().int().min(1).max(1000).optional()
				.describe("Number of results per page (1-1000, default 100)"),
			page: z.number().int().min(1).optional()
				.describe("Page number (1-indexed)"),
			category: z.enum(["books", "articles", "tweets", "supplementals", "podcasts"]).optional()
				.describe("Filter by Readwise category"),
			source: z.string().optional()
				.describe("Filter by source (e.g. 'kindle', 'instapaper')"),
			updated__lt: z.string().optional()
				.describe("ISO 8601 datetime — only include books updated before this time"),
			updated__gt: z.string().optional()
				.describe("ISO 8601 datetime — only include books updated after this time"),
			last_highlight_at__lt: z.string().optional()
				.describe("ISO 8601 datetime — only include books whose last highlight is before this time"),
			last_highlight_at__gt: z.string().optional()
				.describe("ISO 8601 datetime — only include books whose last highlight is after this time"),
		},
		path: () => "/books/",
	},
	"get-book": {
		description: "Retrieve a specific book by ID (GET /api/v2/books/{book_id}/).",
		inputShape: {
			book_id: z.number().int().describe("The ID of the book to retrieve"),
		},
		path: (a) => `/books/${a.book_id}/`,
		pathParams: ["book_id"],
	},
	"list-book-tags": {
		description: "List tags on a specific book (GET /api/v2/books/{book_id}/tags/).",
		inputShape: {
			book_id: z.number().int().describe("The ID of the book whose tags to list"),
			page_size: z.number().int().min(1).max(1000).optional()
				.describe("Number of results per page (1-1000, default 100)"),
			page: z.number().int().min(1).optional()
				.describe("Page number (1-indexed)"),
		},
		path: (a) => `/books/${a.book_id}/tags/`,
		pathParams: ["book_id"],
	},
	"get-book-tag": {
		description: "Retrieve a specific tag on a book (GET /api/v2/books/{book_id}/tags/{tag_id}/).",
		inputShape: {
			book_id: z.number().int().describe("The ID of the book"),
			tag_id: z.number().int().describe("The ID of the tag on that book"),
		},
		path: (a) => `/books/${a.book_id}/tags/${a.tag_id}/`,
		pathParams: ["book_id", "tag_id"],
	},
	"list-highlights": {
		description: "List highlights in the Readwise library (GET /api/v2/highlights/).",
		inputShape: {
			page_size: z.number().int().min(1).max(1000).optional()
				.describe("Number of results per page (1-1000, default 100)"),
			page: z.number().int().min(1).optional()
				.describe("Page number (1-indexed)"),
			book_id: z.number().int().optional()
				.describe("Filter by book ID"),
			updated__lt: z.string().optional()
				.describe("ISO 8601 datetime — only include highlights updated before this time"),
			updated__gt: z.string().optional()
				.describe("ISO 8601 datetime — only include highlights updated after this time"),
			highlighted_at__lt: z.string().optional()
				.describe("ISO 8601 datetime — only include highlights created before this time"),
			highlighted_at__gt: z.string().optional()
				.describe("ISO 8601 datetime — only include highlights created after this time"),
		},
		path: () => "/highlights/",
	},
	"get-highlight": {
		description: "Retrieve a specific highlight by ID (GET /api/v2/highlights/{highlight_id}/).",
		inputShape: {
			highlight_id: z.number().int().describe("The ID of the highlight to retrieve"),
		},
		path: (a) => `/highlights/${a.highlight_id}/`,
		pathParams: ["highlight_id"],
	},
	"list-highlight-tags": {
		description: "List tags on a specific highlight (GET /api/v2/highlights/{highlight_id}/tags/).",
		inputShape: {
			highlight_id: z.number().int().describe("The ID of the highlight whose tags to list"),
			page_size: z.number().int().min(1).max(1000).optional()
				.describe("Number of results per page (1-1000, default 100)"),
			page: z.number().int().min(1).optional()
				.describe("Page number (1-indexed)"),
		},
		path: (a) => `/highlights/${a.highlight_id}/tags/`,
		pathParams: ["highlight_id"],
	},
	"get-highlight-tag": {
		description: "Retrieve a specific tag on a highlight (GET /api/v2/highlights/{highlight_id}/tags/{tag_id}/).",
		inputShape: {
			highlight_id: z.number().int().describe("The ID of the highlight"),
			tag_id: z.number().int().describe("The ID of the tag on that highlight"),
		},
		path: (a) => `/highlights/${a.highlight_id}/tags/${a.tag_id}/`,
		pathParams: ["highlight_id", "tag_id"],
	},
	"export-highlights": {
		description: "Export highlights from Readwise (GET /api/v2/export_highlights/). Cursor-paginated.",
		inputShape: {
			page_size: z.number().int().min(1).max(1000).optional()
				.describe("Number of results per page (1-1000)"),
			updatedAfter: z.string().optional()
				.describe("ISO 8601 datetime — only include highlights updated after this time"),
			ids: z.array(z.number().int()).optional()
				.describe("List of highlight IDs to export"),
			includeDeleted: z.boolean().optional()
				.describe("Whether to include deleted highlights (default false)"),
			pageCursor: z.string().optional()
				.describe("Cursor for pagination (from previous response)"),
		},
		path: () => "/export_highlights/",
	},
	"daily-highlights": {
		description: "Get today's Readwise daily review (GET /api/v2/review/).",
		inputShape: {},
		path: () => "/review/",
	},
};

// Precompute the catalog (with JSON Schemas) and the per-operation Zod parsers
// at startup so list-operations is cheap and invoke-operation can validate fast.
const operationParsers = new Map<string, z.ZodObject<z.ZodRawShape>>();
const catalog = {
	operations: Object.entries(operations).map(([name, op]) => {
		const obj = z.object(op.inputShape);
		operationParsers.set(name, obj);
		return {
			name,
			description: op.description,
			inputSchema: z.toJSONSchema(obj),
		};
	}),
};

server.registerTool(
	"list-operations",
	{
		title: "List Operations",
		description:
			"Return the catalog of Readwise operations available via invoke-operation. " +
			"Each entry has a name, description, and JSON Schema for its arguments. " +
			"Call this first to discover what operations exist before calling invoke-operation.",
		inputSchema: {},
	},
	async () => ({
		content: [{ type: "text", text: JSON.stringify(catalog, null, 2) }],
	}),
);

server.registerTool(
	"invoke-operation",
	{
		title: "Invoke Operation",
		description:
			"Execute a Readwise operation by name. Pass the operation name (see list-operations) " +
			"and an args object matching that operation's inputSchema. Returns the raw Readwise JSON " +
			"response, or an isError result with the status code and body on a non-2xx response.",
		inputSchema: {
			operation: z.string().describe("Operation name from list-operations."),
			args: z.record(z.string(), z.unknown()).optional()
				.describe("Arguments object matching the operation's inputSchema. Omit for zero-arg operations."),
		},
	},
	async ({ operation, args }) => {
		const op = operations[operation];
		const parser = operationParsers.get(operation);
		if (!op || !parser) {
			const known = Object.keys(operations).join(", ");
			return {
				isError: true,
				content: [{ type: "text", text: `Unknown operation '${operation}'. Known operations: ${known}.` }],
			};
		}
		const parsed = parser.safeParse(args ?? {});
		if (!parsed.success) {
			return {
				isError: true,
				content: [{ type: "text", text: `Invalid arguments for ${operation}: ${parsed.error.message}` }],
			};
		}
		const validated = parsed.data as Record<string, unknown>;
		const pathParamSet = new Set(op.pathParams ?? []);
		const query: Record<string, QueryValue> = {};
		for (const [k, v] of Object.entries(validated)) {
			if (pathParamSet.has(k)) continue;
			query[k] = v as QueryValue;
		}
		try {
			const data = await readwiseRequest(op.path(validated), query);
			return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
		} catch (error) {
			return {
				isError: true,
				content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
			};
		}
	},
);

const transport = new StdioServerTransport();
server.connect(transport);
