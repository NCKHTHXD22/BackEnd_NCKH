export class BaseRepository {
    constructor(model) {
        this.model = model;
    }

    async findAll() {
        return this.model.find();
    }

    async findById(id) {
        return this.model.findOne({ id });
    }

    async create(data) {
        return this.model.create(data);
    }

    async update(id, data) {
        return this.model.findOneAndUpdate({ id }, data, { new: true });
    }

    async delete(id) {
        return this.model.findOneAndDelete({ id });
    }
}
