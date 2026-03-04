import Alert from "../../core/entities/Alert.js";
import { BaseRepository } from "./base.repo.js";

class AlertRepository extends BaseRepository {
    constructor() {
        super(Alert);
    }

    async findByDeviceId(deviceId) {
        return Alert.findOne({ deviceId });
    }
}

export const alertRepo = new AlertRepository();
