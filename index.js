// Load dependencies
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const Stripe = require("stripe");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Initialize app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

// MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gs1mqwb.mongodb.net/team-project?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const db = client.db("team-project");
    const usersCollection = db.collection("user");
    const menusCollection = db.collection("menus");
    const ordersCollection = db.collection("orders");
    const paymentsCollection = db.collection("payments");

    // Initialize Stripe
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // users data

    app.post("/users", async (req, res) => {
      try {
        const data = {
          ...req.body,
          createdAt: new Date(),
        };

        const existingUser = await usersCollection.findOne({ email: data.email });
        if (existingUser) {
          return res.status(409).send({ message: "User already exists" });
        }

        const result = await usersCollection.insertOne(data);

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/users", async (req, res) => {
      const cursor = await usersCollection.find().toArray();
      res.send(cursor);
    });

    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ role: "user" }); // default role

        res.send({ role: user.role || "user" }); // 🔹 return role only
      } catch (err) {
        console.error("Failed to fetch role:", err);
        res.status(500).send({ role: "user" });
      }
    });

    app.put("/users/:id", async (req, res) => {
      const { id } = req.params;

      const result = await usersCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: req.body },
        { returnDocument: "after" }
      );

      if (!result.value) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send(result.value);
    });


    app.patch("/users/:id/role", async (req, res) => {
      try {
        const { id } = req.params;
        const role = req.body?.role?.trim();

        const allowedRoles = ["user", "admin", "seller"];
        if (!allowedRoles.includes(role)) {
          return res.status(400).send({ error: "Invalid role provided" });
        }

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid user ID" });
        }

        const result = await usersCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: { role } },
          { returnDocument: "after", upsert: false }
        );

        if (!result.value) {
          return res.status(404).send({ error: "User not found" });
        }

        res.status(200).send({
          success: true,
          message: "User role updated successfully",
          user: result.value,
        });
      } catch (error) {
        console.error("Update role error:", error);
        res.status(500).send({ error: "Server error" });
      }
    });


    // menus APIs
    app.get("/menus", async (req, res) => {
      try {
        const menus = await menusCollection.find().toArray();
        res.send(menus);
      } catch {
        res.status(500).send({ error: "Failed to fetch menus" });
      }
    });

    app.get("/menus/:id", async (req, res) => {
      const { id } = req.params;
      const menu = await menusCollection.findOne({ _id: new ObjectId(id) });
      if (!menu) return res.status(404).send({ error: "Menu not found" });
      res.send(menu);
    });

    app.get("/menus/user/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const menus = await menusCollection
          .find({ postedBy: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(menus);
      } catch {
        res.status(500).send({ error: "Failed to fetch user menus" });
      }
    });

    app.post("/menus", async (req, res) => {
      try {
        const {
          name,
          price,
          description,
          image,
          isAvailable = true,
          postedBy,
        } = req.body;

        if (!name || !price || !postedBy) {
          return res
            .status(400)
            .send({ error: "Name, price and postedBy required" });
        }

        const menu = {
          name,
          price: Number(price),
          description: description || "",
          image: image || "",
          isAvailable,
          postedBy,
          createdAt: new Date(),
        };

        const result = await menusCollection.insertOne(menu);
        res.status(201).send(result);
      } catch {
        res.status(500).send({ error: "Failed to add menu" });
      }
    });

    app.patch("/menus/:id", async (req, res) => {
      const id = req.params.id;
      const result = await menusCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );
      res.send(result);
    });

    app.delete("/menus/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await menusCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (!result.deletedCount) {
          return res.status(404).send({ error: "Menu not found" });
        }

        res.send({ message: "Menu deleted" });
      } catch {
        res.status(400).send({ error: "Invalid ID" });
      }
    });

    // orders APIs
    app.post("/orders", async (req, res) => {
      try {
        const {
          userId,
          username,
          email,
          menuId,
          menuName,
          price,
          quantity = 1,
          status = "pending",
          createdAt = new Date().toISOString(),
        } = req.body;

        if (!userId || !menuId || !menuName || !price) {
          return res
            .status(400)
            .send({ error: "Missing required order fields" });
        }

        const order = {
          userId,
          username,
          email,
          menuId,
          menuName,
          price,
          quantity,
          status,
          createdAt,
        };

        const result = await ordersCollection.insertOne(order);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to create order" });
      }
    });

    app.get("/orders", async (req, res) => {
      const orders = await ordersCollection.find().toArray();
      res.send(orders);
    });

    app.get("/orders/user/:userId", async (req, res) => {
      const userId = req.params.userId;
      const orders = await ordersCollection.find({ userId }).toArray();
      res.send(orders);
    });

    // ------------STRIPE------------

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amount, userEmail, userName, description } = req.body;

        if (!amount || Number(amount) <= 0) {
          return res.status(400).json({ error: "Invalid amount" });
        }

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: description || "Order Payment",
                },
                unit_amount: Math.round(Number(amount) * 100),
              },
              quantity: 1,
            },
          ],
          success_url: `${process.env.CLIENT_URL}/payments-success`,
          cancel_url: `${process.env.CLIENT_URL}/payments-cancel`,
        });

        res.json({ url: session.url });
      } catch (error) {
        console.error("Stripe error:", error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // ------------STRIPE------------

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

// Routes
app.get("/", (req, res) => {
  res.send("TastyHaat Server is running");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on PORT:${port}`);
});
