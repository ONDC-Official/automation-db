import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
export default (req: Request, res: Response, next: NextFunction) => {
    const clientApiKey = req.get("x-api-key");
    const serverApiKey = process.env.API_SERVICE_KEY;

    if(!serverApiKey) {
        logger.error({
            message: "API key is not set in the environment variables"
        });
        throw new Error("API key is not set in the environment variables");
    }
    if (!clientApiKey) {
        res.status(403).send("API key is missing in the request");
        return;
    }
    if(!(serverApiKey === clientApiKey)) {
        res.status(403).send("API key is invalid.");
        return;
    }
    next();
};
  