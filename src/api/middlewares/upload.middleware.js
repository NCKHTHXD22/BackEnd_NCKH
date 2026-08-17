import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
    filename: (req, file, cb) => {
        // Thêm hậu tố ngẫu nhiên: Date.now() dùng chung cho mọi file trong 1 request
        // (độ phân giải mili-giây) nên nhiều ảnh cùng lúc có thể trùng tên nếu chỉ dùng timestamp.
        const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}_${file.originalname}`);
    },
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname);
    if (![".jpg", ".jpeg", ".png"].includes(ext.toLowerCase())) {
        return cb(new Error("Only images are allowed"), false);
    }
    cb(null, true);
};

const upload = multer({ storage, fileFilter });

export default upload;
