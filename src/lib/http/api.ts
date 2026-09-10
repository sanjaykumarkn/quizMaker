import { NextResponse } from "next/server";

import { AppError, ConflictError, ValidationError, type FieldErrors } from "@/lib/errors";

/**
 * The API layer's only job: translate between HTTP and the service layer. Every route handler
 * shares this error envelope so clients can rely on one shape.
 *
 *   { "error": { "code": "...", "message": "...", "fields": { "email": ["..."] } } }
 */

export function jsonOk<T>(body: T, status = 200): NextResponse {
	return NextResponse.json(body, { status });
}

export function noContent(): NextResponse {
	return new NextResponse(null, { status: 204 });
}

export function errorResponse(code: string, message: string, status: number, fields?: FieldErrors): NextResponse {
	return NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

/** JSON body reader that reports a malformed payload as a validation failure, not a crash. */
export async function readJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new ValidationError("Request body must be valid JSON.", {
			_form: ["Request body must be valid JSON."],
		});
	}
}

export function toErrorResponse(error: unknown): NextResponse {
	if (error instanceof ValidationError || error instanceof ConflictError) {
		return errorResponse(error.code, error.message, error.status, error.fields);
	}

	if (error instanceof AppError) {
		return errorResponse(error.code, error.message, error.status);
	}

	// Unexpected failures are logged server-side and reported opaquely, so internal details
	// such as SQL text never reach the client.
	console.error("Unhandled API error", error);
	return errorResponse("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
}

type RouteHandler<TContext> = (request: Request, context: TContext) => Promise<NextResponse>;

export function withErrorHandling<TContext>(handler: RouteHandler<TContext>): RouteHandler<TContext> {
	return async (request, context) => {
		try {
			return await handler(request, context);
		} catch (error) {
			return toErrorResponse(error);
		}
	};
}
