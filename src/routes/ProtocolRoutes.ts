import { Router } from "express";
import multer from "multer";
import {
    ingestSpec,
    getSpec,
    getBuilds,
} from "../controllers/ProtocolController";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/specs", upload.fields([{ name: "spec", maxCount: 1 }, { name: "validationTable", maxCount: 1 }]), ingestSpec);
router.get("/builds", getBuilds);
router.get("/specs/:domain/:version", getSpec);

export default router;
