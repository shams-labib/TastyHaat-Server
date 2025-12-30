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
app.use(cors());
app.use(express.json());

// MongoDB
const uri = process.env.uri;
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
    await client.connect();

    const db = client.db("team-project");
    const usersCollection = db.collection("user");
    const menusCollection = db.collection("menus");
    const ordersCollection = db.collection("orders");
    const paymentsCollection = db.collection("payments");

    // Initialize Stripe
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // users data

    app.post("/users", async (req, res) => {
      const data = req.body;
      const result = await usersCollection.insertOne(data);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const cursor = await usersCollection.find().toArray();
      res.send(cursor);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ error: "User not found" });
      res.send(user);
    });

    app.put("/users/:uid", async (req, res) => {
      const { uid } = req.params;
      const updatedData = req.body;

      const result = await usersCollection.findOneAndUpdate(
        { uid },
        { $set: updatedData },
        { returnDocument: "after" }
      );

      if (!result.value)
        return res.status(404).json({ message: "User not found" });
      res.json(result.value);
    });

    app.patch("/users/:id/role", async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        const allowedRoles = ["User", "Admin", "Food Seller"];
        if (!allowedRoles.includes(role)) {
          return res.status(400).send({ error: "Invalid role" });
        }

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid user ID" });
        }

        const result = await usersCollection.findOneAndUpdate(
          { _id: new ObjectId(id) }, // always valid ObjectId
          { $set: { role } },
          { returnDocument: "after" }
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
        console.error(error);
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
          success_url: "http://localhost:5173/payments-success",
          cancel_url: "http://localhost:5173/payments-cancel",
        });
    
        res.json({ url: session.url });
      } catch (error) {
        console.error("Stripe error:", error.message);
        res.status(500).json({ error: error.message });
      }
    });

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
  res.send("Mal is running");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
