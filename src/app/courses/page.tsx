import Link from "next/link";
import { format, parseISO } from "date-fns";
import { CalendarDaysIcon, ClockIcon } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export const metadata = {
  title: "Courses — CPPD Pakistan",
  description:
    "Explore CPPD Pakistan's counselling and psychotherapy programmes and apply to an open batch.",
};

// Always reflect live enrolment state — never serve a stale catalogue.
export const dynamic = "force-dynamic";

type CourseRow = Database["public"]["Tables"]["courses"]["Row"];
type CategoryRow = Database["public"]["Tables"]["course_categories"]["Row"];
type OpenBatchRow =
  Database["public"]["Functions"]["get_open_batches"]["Returns"][number];

function fmtDate(value: string): string {
  // class_start is a date (yyyy-MM-dd); enrolment bounds are ISO timestamps.
  return format(parseISO(value), "d MMM yyyy");
}

function BatchRow({ batch }: { batch: OpenBatchRow }) {
  const isFull = batch.availability === "full";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{batch.batch_number}</p>
          {batch.availability === "limited" ? (
            <Badge variant="secondary">Limited places</Badge>
          ) : null}
          {isFull ? <Badge variant="outline">Full</Badge> : null}
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <CalendarDaysIcon className="size-3.5 shrink-0" />
          Classes start {fmtDate(batch.class_start)}
        </p>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ClockIcon className="size-3.5 shrink-0" />
          Enrolment {fmtDate(batch.enrollment_start)} –{" "}
          {fmtDate(batch.enrollment_end)}
        </p>
      </div>
      {isFull ? (
        <Button size="sm" disabled className="shrink-0">
          Batch full
        </Button>
      ) : (
        <Button asChild size="sm" className="shrink-0">
          <Link href={`/apply/${batch.batch_id}`}>Apply</Link>
        </Button>
      )}
    </div>
  );
}

function CourseCard({
  course,
  batches,
}: {
  course: CourseRow;
  batches: OpenBatchRow[];
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{course.title}</CardTitle>
        {course.description ? (
          <CardDescription>{course.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="mt-auto">
        {batches.length === 0 ? (
          <p className="text-muted-foreground text-sm">Enrollment closed</p>
        ) : (
          <div className="space-y-4">
            {batches.map((batch, index) => (
              <div key={batch.batch_id} className="space-y-4">
                {index > 0 ? <Separator /> : null}
                <BatchRow batch={batch} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function CoursesPage() {
  const supabase = await createClient();

  // RLS returns only active courses / published batches; the RPC applies the
  // server's own openness rule (window + capacity) so we never judge from dates.
  const [categoriesRes, coursesRes, openBatchesRes] = await Promise.all([
    supabase
      .from("course_categories")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false }),
    supabase.from("courses").select("*").order("title", { ascending: true }),
    supabase.rpc("get_open_batches"),
  ]);

  const categories: CategoryRow[] = categoriesRes.data ?? [];
  const courses: CourseRow[] = coursesRes.data ?? [];
  const openBatches: OpenBatchRow[] = openBatchesRes.data ?? [];

  // Index open batches by course, ordered by soonest class start.
  const batchesByCourse = new Map<string, OpenBatchRow[]>();
  for (const batch of openBatches) {
    const list = batchesByCourse.get(batch.course_id) ?? [];
    list.push(batch);
    batchesByCourse.set(batch.course_id, list);
  }
  for (const list of batchesByCourse.values()) {
    list.sort((a, b) => a.class_start.localeCompare(b.class_start));
  }

  const sections = categories
    .map((category) => ({
      category,
      courses: courses.filter((course) => course.category_id === category.id),
    }))
    .filter((section) => section.courses.length > 0);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
        <section className="mb-10 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Courses
          </h1>
          <p className="text-muted-foreground mt-3 text-lg">
            Explore our accredited counselling and psychotherapy programmes and
            apply to an open batch. Complete your profile first, then apply in
            minutes.
          </p>
        </section>

        {sections.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            There are no courses available right now. Please check back soon.
          </p>
        ) : (
          <div className="space-y-12">
            {sections.map(({ category, courses: categoryCourses }) => (
              <section key={category.id} aria-labelledby={`cat-${category.id}`}>
                <h2
                  id={`cat-${category.id}`}
                  className="mb-4 text-xl font-semibold tracking-tight"
                >
                  {category.name}
                </h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryCourses.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      batches={batchesByCourse.get(course.id) ?? []}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
