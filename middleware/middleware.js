// middleware/middleware.js

module.exports = (req, res, next) => {
  // Simulate logged-in user
  req.user = { id: 'UNI002' }; 
  next();
};
