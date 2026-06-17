const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'nova_chat_secret_key';

module.exports = function(req, res, next) {
  // Get token from header
  const authHeader = req.header('Authorization');
  let token = req.header('x-auth-token') || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);

  // Check if no token
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};
