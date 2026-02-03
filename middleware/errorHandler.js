/**
 * Global error handler middleware.
 * Must be registered after all routes.
 */
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  const status = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
};

export default errorHandler;
