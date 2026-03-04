import mongoose from "mongoose";

const alertSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        index: true,
        unique: true,
    },
    locationName: {
        type: String,
        required: true,
    },
    coordinates: {
        lat: {
            type: Number,
            required: true,
        },
        lng: {
            type: Number,
            required: true,
        },
    },
    data: {
        waterLevel: {
            type: Number,
            required: true,
        },
        isRaining: {
            type: Boolean,
            required: true,
        },
        temperature: {
            type: Number,
        },
        humidity: {
            type: Number,
        },
        isSevere: {
            type: Boolean,
            default: false,
        },
        description: {
            type: String,
            default: "",
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    }
}, { timestamps: true });

const Alert = mongoose.model("Alert", alertSchema);

export default Alert;
