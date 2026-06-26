import { Request, Response } from "express";
import logger from "@ondc/automation-logger";
import { ProtocolService } from "../services/ProtocolService";

const protocolService = new ProtocolService();

export const ingestSpec = async (req: Request, res: Response) => {
    try {
        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const specFile = files?.["spec"]?.[0];
        if (!specFile) {
            res.status(400).json({ message: "Missing required field: spec" });
            return;
        }

        const result = await protocolService.ingestSpec(specFile.buffer);
        const domain = result.domain;
        const version = result.version;

        const tableFile = files?.["validationTable"]?.[0];
        if (tableFile) {
            await protocolService.ingestValidationTable(domain, version, tableFile.buffer);
        }

        if (result.skipped) {
            res.status(200).json({
                message: "Build already ingested (identical hash)",
                domain: result.domain,
                version: result.version,
            });
        } else {
            res.status(200).json({
                message: "Build ingested successfully",
                domain: result.domain,
                version: result.version,
                changes: result.changes,
            });
        }
    } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);

        if (error?.zodIssues) {
            const errors = error.zodIssues.map(
                (issue: any) => `${issue.path.join(".")}: ${issue.message}`,
            );
            logger.error("Build config validation failed", { errors });
            res.status(422).json({
                message: "Build config validation failed",
                errors,
            });
            return;
        }

        logger.error("Error ingesting spec", { message });
        res.status(500).json({
            message: "Error ingesting build",
            error: message,
        });
    }
};

export const getSpec = async (req: Request, res: Response) => {
    try {
        const { domain, version } = req.params;
        if (!domain || !version) {
            res.status(400).json({
                message: "domain and version are required",
            });
            return;
        }

        const include =
            typeof req.query.include === "string"
                ? req.query.include.split(",")
                : undefined;

        const result = await protocolService.getSpec({
            domain,
            version,
            include,
            usecase: req.query.usecase as string | undefined,
            flowId: req.query.flowId as string | undefined,
            tag: req.query.tag as string | undefined,
            docSlug: req.query.docSlug as string | undefined,
        });

        if (result.meta === null && !include) {
            res.status(404).json({ message: "Spec not found" });
            return;
        }

        res.json(result);
    } catch (error) {
        logger.error("Error fetching spec", error);
        res.status(500).json({ message: "Error fetching spec", error });
    }
};

export const getBuilds = async (_req: Request, res: Response) => {
    try {
        const result = await protocolService.getBuilds();
        res.json(result);
    } catch (error) {
        logger.error("Error fetching builds", error);
        res.status(500).json({ message: "Error fetching builds", error });
    }
};
