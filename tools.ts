import { OpenAIEmbeddings } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { z } from "zod";
import { parseFullName, sendEmail } from "./util";

interface dbConfigProps {
  collection: any;
  indexName: string;
  textKey: string;
  embeddingKey: string;
}
// Function to create the employee lookup tool
export const createEmployeeLookupTool = (dbConfig: dbConfigProps) =>
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
export const createEmployeeRenameTool = (dbConfig: dbConfigProps) =>
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

export const createSendEmailTool = (dbConfig: dbConfigProps) =>
  tool(
    async ({
      name,
      subject,
      body,
    }: {
      name: string;
      subject: string;
      body: string;
    }) => {
      try {
        // Query the database for the employee's contact details
        const employee = await dbConfig.collection.findOne(
          {
            first_name: { $regex: new RegExp(`^${name}$`, "i") }, // Case-insensitive name search
          },
          {
            projection: { "contact_details.email": 1 }, // Include only the email field
          }
        );

        if (!employee || !employee.contact_details?.email) {
          return `No employee found with the name "${name}" or email not available.`;
        }

        // Extract email from the result
        const employeeEmail = employee.contact_details.email;

        // Send email
        const info = await sendEmail({
          to: employeeEmail,
          subject,
          text: body,
        });

        if (info?.accepted && info?.accepted?.length > 0) {
          return `Email sent successfully to ${employeeEmail}`;
        } else {
          return "Failed to send email. Please check the email details and try again.";
        }
      } catch (error) {
        console.error("Error while sending email:", error);
        return "An error occurred while sending the email. Please try again later.";
      }
    },
    {
      name: "send_email",
      description: "Sends an email to an employee based on their first name",
      schema: z.object({
        name: z.string().describe("The first name of the employee."),
        subject: z.string().describe("The subject of the email."),
        body: z.string().describe("The body of the email."),
      }),
    }
  );

export const createCrudTool = (dbConfig: dbConfigProps) =>
  tool(
    async ({
      employee_id,
      action,
      data,
    }: {
      employee_id: string;
      action: string;
      data?: object;
    }) => {
      console.log("CRUD tool called");
      console.log("actions: ", action);

      console.log("data: ", data);

      try {
        switch (action.toLowerCase()) {
          // Create a new employee record
          case "create": {
            if (!data) {
              return "Data is required for creating a new employee.";
            }
            const result = await dbConfig.collection.insertOne(data);
            return result?.acknowledged
              ? `Employee created successfully with ID: ${result.insertedId}`
              : "Failed to create employee.";
          }

          // Read an employee record by ID
          case "read": {
            const employee = await dbConfig.collection.findOne({
              employee_id,
            });
            return employee
              ? JSON.stringify(employee)
              : `No employee found with ID: ${employee_id}`;
          }

          // Update an employee record
          case "update": {
            if (!data) {
              return "Data is required for updating an employee.";
            }
            const result = await dbConfig.collection.updateOne(
              { employee_id },
              { $set: data }
            );
            return result.modifiedCount === 1
              ? `Employee with ID ${employee_id} updated successfully.`
              : `Failed to update employee with ID ${employee_id}.`;
          }

          // Delete an employee record
          case "delete": {
            const result = await dbConfig.collection.deleteOne({
              employee_id,
            });
            return result.deletedCount === 1
              ? `Employee with ID ${employee_id} deleted successfully.`
              : `Failed to delete employee with ID ${employee_id}.`;
          }

          // Invalid action
          default:
            return `Invalid action "${action}". Valid actions are: create, read, update, delete.`;
        }
      } catch (error) {
        console.error("Error in CRUD tool:", error);
        return `An error occurred while performing the "${action}"`;
      }
    },
    {
      name: "crud_tool",
      description: "Performs CRUD operations on the employee database.",
      schema: z.object({
        employee_id: z
          .string()
          .describe("The unique identifier of the employee in the database."),
        action: z
          .string()
          .describe(
            'The action to perform: "create", "read", "update", or "delete".'
          ),
        data: z
          .record(z.any())
          .optional()
          .describe(
            "The data to use for creation or updates (optional for read and delete)."
          ),
      }),
    }
  );
