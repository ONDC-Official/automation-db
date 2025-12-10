import { Request, Response } from "express";
import { UserRepository } from "../repositories/UserRepository";
import { UserService } from "../services/UserService";
import logger from "../utils/logger";

// ---------------------- Constructor ----------------------

const userRepo = new UserRepository();
const userService = new UserService(userRepo);

// ---------------------- Controller Methods ----------------------

/**
 * Fetch all users
 */
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info("Fetching all users");
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    logger.error("Error retrieving users", error);
    res.status(500).send("Error retrieving users");
  }
};

/**
 * Fetch user by GitHub ID
 */
export const getUserByGithubId = async (req: Request, res: Response): Promise<void> => {
  const { githubId } = req.params;
  try {
    logger.info(`Fetching user with GitHub ID: ${githubId}`);
    const user = await userService.getUserByGithubId(githubId);

    if (!user) {
      res.status(404).send("User not found");
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error(`Error retrieving user with GitHub ID: ${githubId}`, error);
    res.status(400).send("Error retrieving user");
  }
};

/**
 * Create a new user
 */
export const createUser = async (req: Request, res: Response): Promise<void> => {
  const userData = req.body;
  try {
    logger.info("Creating new user", { userData });
    const createdUser = await userService.createUser(userData);
    res.status(201).json(createdUser);
  } catch (error) {
    logger.error("Error creating user", error);
    res.status(400).send("Error creating user");
  }
};

/**
 * Delete user by GitHub ID
 */
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const { githubId } = req.params;
  try {
    logger.info(`Deleting user with GitHub ID: ${githubId}`);
    await userService.deleteUser(githubId);
    res.status(200).send("Deleted successfully");
  } catch (error) {
    logger.error(`Error deleting user with GitHub ID: ${githubId}`, error);
    res.status(400).send("Error deleting user");
  }
};

