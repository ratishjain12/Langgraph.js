import { OpenAIEmbeddings } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { z } from "zod";
import { parseFullName } from "./util";

// Function to create the employee lookup tool
export const createEmployeeLookupTool = (dbConfig: {
  collection: any;
  indexName: string;
  textKey: string;
  embeddingKey: string;
}) =>
  tool(
    async ({ query, n = 10 }) => {
      console.log("Employee lookup tool called");

      // Initialize vector store
      const vectorStore = new MongoDBAtlasVectorSearch(
        new OpenAIEmbeddings(),
        dbConfig
      );

      const result = await vectorStore.similaritySearchWithScore(query, n);
      return JSON.stringify(result);
    },
    {
      name: "employee_lookup",
      description: "Gathers employee details from the HR database",
      schema: z.object({
        query: z.string().describe("The search query"),
        n: z
          .number()
          .optional()
          .default(10)
          .describe("Number of results to return"),
      }),
    }
  );

// Function to rename the employee name
export const createEmployeeRenameTool = (dbConfig: {
  collection: any;
  indexName: string;
  textKey: string;
  embeddingKey: string;
}) =>
  tool(
    async ({ employee_name, new_name }) => {
      console.log("Rename employee tool called");

      try {
        // Step 1: Parse the full name into first_name and last_name
        const { first_name, last_name } = parseFullName(employee_name);

        // Step 2: Find the employee by first_name and last_name (case-insensitive search)
        const employee = await dbConfig.collection.findOne({
          first_name: { $regex: new RegExp(`^${first_name}$`, "i") }, // Case-insensitive search for first_name
          last_name: { $regex: new RegExp(`^${last_name}$`, "i") }, // Case-insensitive search for last_name
        });

        if (!employee) {
          return `No employee found with the name "${employee_name}". Please check the name and try again.`;
        }

        // Step 3: Parse the new name into first_name and last_name
        const { first_name: new_first_name, last_name: new_last_name } =
          parseFullName(new_name);

        let updatedFields: { first_name?: string; last_name?: string } = {};

        // Step 4: Check if first_name or last_name is being updated
        if (new_first_name && new_first_name !== first_name) {
          updatedFields.first_name = new_first_name;
        }

        if (new_last_name && new_last_name !== last_name) {
          updatedFields.last_name = new_last_name;
        }

        // Optionally handle an alias field (if present in your schema)
        if (updatedFields.first_name || updatedFields.last_name) {
          const result = await dbConfig.collection.updateOne(
            { _id: employee._id }, // Use the unique `_id` to identify the document
            { $set: updatedFields }
          );

          if (result.modifiedCount === 1) {
            return `Employee "${employee_name}" has been successfully renamed to "${new_name}".`;
          } else {
            return `Failed to rename employee "${employee_name}". Update operation did not modify any records.`;
          }
        } else {
          return `No changes detected for employee "${employee_name}".`;
        }
      } catch (error: unknown) {
        console.error("Error in renameEmployeeTool:", error);
        return `An error occurred while renaming the employee: ${error}`;
      }
    },
    {
      name: "rename_employee",
      description:
        "Renames an employee in the HR database. First, it looks up the employee by name and then updates their name.",
      schema: z.object({
        employee_name: z
          .string()
          .describe("The current full name of the employee."),
        new_name: z.string().describe("The new full name for the employee."),
      }),
    }
  );
