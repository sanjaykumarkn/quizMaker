/**
 * Domain errors thrown by the service layer. The API layer is the only place that turns
 * these into HTTP status codes, which keeps services free of transport concerns.
 */

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, message: string, status: number) {
		super(message);
		this.name = new.target.name;
		this.code = code;
		this.status = status;
	}
}

export class ValidationError extends AppError {
	readonly fields: FieldErrors;

	constructor(message = "The submitted data is invalid.", fields: FieldErrors = {}) {
		super("VALIDATION_ERROR", message, 400);
		this.fields = fields;
	}
}

export class NotFoundError extends AppError {
	constructor(code: string, message: string) {
		super(code, message, 404);
	}
}

export class ConflictError extends AppError {
	readonly fields: FieldErrors;

	constructor(code: string, message: string, fields: FieldErrors = {}) {
		super(code, message, 409);
		this.fields = fields;
	}
}

export class UnauthenticatedError extends AppError {
	constructor(code = "UNAUTHENTICATED", message = "Authentication is required.") {
		super(code, message, 401);
	}
}

export class ForbiddenError extends AppError {
	constructor(code = "FORBIDDEN", message = "You are not allowed to perform this action.") {
		super(code, message, 403);
	}
}

/**
 * Deliberately identical for an unknown username and a wrong password so that the response
 * cannot be used to discover which accounts exist.
 */
export class InvalidCredentialsError extends UnauthenticatedError {
	constructor() {
		super("INVALID_CREDENTIALS", "Invalid username or password.");
	}
}
