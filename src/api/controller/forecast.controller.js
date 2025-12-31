import ForecastService from '../../services/forecast.service.js';

const service = new ForecastService();

export const getAll = async (req, res) => {
  res.json(await service.getAll());
};

export const getById = async (req, res) => {
  res.json(await service.getById(req.params.id));
};

export const getByReservoirId = async (req, res) => {
  res.json(await service.getByReservoirId(req.params.reservoirId));
};

export const create = async (req, res) => {
  res.status(201).json(await service.create(req.body));
};

export const bulkCreate = async (req, res) => {
  res.status(201).json({
    inserted: (await service.bulkCreate(req.body)).length
  });
};

export const update = async (req, res) => {
  res.json(await service.update(req.params.id, req.body));
};

export const remove = async (req, res) => {
  await service.delete(req.params.id);
  res.json({ message: 'Deleted' });
};
