import Notification from "../../core/entities/Notification.js";
import { BaseRepository } from "./base.repo.js";

class NotificationRepository extends BaseRepository {
    constructor() {
        super(Notification);
    }
}

export const notificationRepo = new NotificationRepository();
