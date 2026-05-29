import { createRouter, createWebHashHistory } from "vue-router";
import KnowledgeView from "@/views/home/knowledge.vue";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "knowledge",
      component: KnowledgeView,
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

export default router;
