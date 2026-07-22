export class AppError extends Error {
  constructor(public message: string, public statusCode: number = 400) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado. Token faltante o inválido.') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado. No tienes permisos para esta acción.') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'El recurso solicitado no existe.') {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Datos de entrada inválidos.') {
    super(message, 400);
  }
}