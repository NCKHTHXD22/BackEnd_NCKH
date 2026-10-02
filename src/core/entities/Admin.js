import mongoose from "mongoose";
import bcrypt from "bcrypt";

const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String },
    name: { type: String },
    passwordHash: { type: String, required: true },
    // Admin tự đăng ký qua /admin/register → 'pending', chưa đăng nhập được
    // cho tới khi 1 admin khác duyệt. Admin cũ (tạo trước field này tồn tại)
    // không có giá trị này trong DB — adminAuth.controller coi undefined như
    // 'active' để không khoá đăng nhập của các tài khoản hiện có.
    status: { type: String, enum: ['pending', 'active'], default: 'active' },
}, { timestamps: true });

adminSchema.methods.setPassword = async function (password) {
    this.passwordHash = await bcrypt.hash(password, 10);
};

adminSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.passwordHash);
};

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
