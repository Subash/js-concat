import gulp from 'gulp';
import babel from 'gulp-babel';
import del from 'del';
import series from 'gulp-sequence';

gulp.task('clean-lib', (cb)=> {
  del.sync('lib');
  cb();
});

gulp.task('compile-src', ['clean-lib'], ()=> {
  return gulp.src('src/**/*.js')
    .pipe(babel())
    .pipe(gulp.dest('lib'));
});

gulp.task('watch', ['clean-lib'], ()=> {
  return gulp.watch('src/**/*.js', ['compile-src']);
});

gulp.task('default', ['compile-src', 'watch']);

gulp.task('prepublish', series('clean-lib', 'compile-src'));
