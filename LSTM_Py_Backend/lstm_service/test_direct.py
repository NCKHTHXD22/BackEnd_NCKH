import asyncio
from datetime import datetime
from main_api import optimize_dam_operation, OptimizeRequest

async def run():
    try:
        req = OptimizeRequest(
            reservoir_id=1,
            current_water_level=375.0,
            current_inflow=800.0,
            downstream_limit=1000.0
        )
        res = await optimize_dam_operation(req)
        print("Optimization Summary:", res.optimization_summary)
        print("Success")
    except Exception as e:
        print("Error:", repr(e))

asyncio.run(run())
