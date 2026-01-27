import rainLakeHistoryService from '../../services/rainLakeHistory.service.js';

export const getByLake = async (req, res) => {
  res.json(await rainLakeHistoryService.getByLake(+req.params.Id_Lake));
};

export const getByRange = async (req, res) => {
  const { from, to } = req.query;
  res.json(
    await rainLakeHistoryService.getByRange(
      +req.params.Id_Lake,
      from,
      to
    )
  );
};
