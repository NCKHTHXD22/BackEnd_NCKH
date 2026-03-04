import mongoose from "mongoose";
import bcrypt from "bcrypt";

const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String },
    name: { type: String },
    passwordHash: { type: String, required: true },
}, { timestamps: true });

adminSchema.methods.setPassword = async function (password) {
    this.passwordHash = await bcrypt.hash(password, 10);
};

adminSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.passwordHash);
};

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
