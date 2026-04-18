import InflowLake from '../../core/entities/InflowLake.js';

class InflowLakeRepository {
    findAll() {
        return InflowLake.find().sort({ Id_Lake: 1 });
    }

    findByLakeId(Id_Lake) {
        return InflowLake.findOne({ Id_Lake });
    }

    // update cả sumDepth + level
    updateFromHistory(Id_Lake, sumDepth, level, timestamp) {
        return InflowLake.findOneAndUpdate(
            { Id_Lake },
            {
                sumDepth,
                level,
                lastUpdate: timestamp
            },
            { new: true }
        );
    }

    // update hydro data (inflow, outflow, waterlevel)
    updateHydroData(Id_Lake, qvao, luuluongxa, htl, timestamp, q_turbine = 0, q_spillway = 0) {
        return InflowLake.findOneAndUpdate(
            { Id_Lake },
            {
                qvao,
                luuluongxa,
                q_turbine,
                q_spillway,
                htl,
                lastUpdate: timestamp || new Date()
            },
            { new: true }
        );
    }
}

export default new InflowLakeRepository();
