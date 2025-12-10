import { Router } from "express";
import {
  getAllUsers,
  getUserByGithubId,
  createUser,
  deleteUser,
} from "../controllers/UserController";

const router = Router();

// Fetch all users
router.get("/", getAllUsers);

// Fetch a user by GitHub ID
router.get("/:githubId", getUserByGithubId);

// Create a new user
router.post("/", createUser);

// Delete a user by GitHub ID
router.delete("/:githubId", deleteUser);

export default router;
