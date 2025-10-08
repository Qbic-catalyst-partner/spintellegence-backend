// utils/otpStore.js
const otpMap = {};

module.exports = {
  setOtp(email, otp) {
    otpMap[email] = {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 mins
    };
  },
  getOtp(email) {
    return otpMap[email];
  },
  deleteOtp(email) {
    delete otpMap[email];
  },
};
