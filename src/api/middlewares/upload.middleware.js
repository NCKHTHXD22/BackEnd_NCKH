import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
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
