import { SiteHeader } from "@/components/site-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { placeholderCourses } from "@/lib/placeholder-data";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
        <section className="mb-10 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Train as a therapist with CPPD Pakistan
          </h1>
          <p className="text-muted-foreground mt-3 text-lg">
            Explore our accredited counselling and psychotherapy programmes.
            Register, complete your profile, and apply to an upcoming batch.
          </p>
        </section>

        <section aria-labelledby="courses-heading">
          <h2 id="courses-heading" className="mb-4 text-xl font-semibold">
            Available courses
          </h2>
          {/* TODO: replace placeholderCourses with a Supabase query. */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {placeholderCourses.map((course) => (
              <Card key={course.id} className="flex flex-col">
                <CardHeader>
                  {course.requirements.references.enabled ? (
                    <Badge variant="secondary" className="mb-2 w-fit">
                      References required
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="mb-2 w-fit">
                      Open enrolment
                    </Badge>
                  )}
                  <CardTitle>{course.title}</CardTitle>
                  <CardDescription>{course.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-muted-foreground mt-auto text-sm">
                  {course.requirements.uploads.length > 0
                    ? `${course.requirements.uploads.length} document(s) required`
                    : "No documents required"}
                </CardContent>
                <CardFooter>
                  <Button className="w-full">View details</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
