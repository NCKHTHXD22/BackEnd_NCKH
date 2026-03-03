export class BaseRepository {
    constructor(model) {
        this.model = model;
    }
    find(filter) {
    return this.model.find(filter);
     }
    findAll() {
        return this.model.find({});
    }

    findOne(filter) {
        return this.model.findOne(filter);
    }

    create(data) {
        return this.model.create(data);
    }

    update(id, data) {
        return this.model.findByIdAndUpdate(id, data, { new: true });
    }

    delete(id) {
        return this.model.findByIdAndDelete(id);
    }
    
    // ⭐ Thêm hàm này để fix lỗi
    deleteMany(filter) {
        return this.model.deleteMany(filter);
    }
}
